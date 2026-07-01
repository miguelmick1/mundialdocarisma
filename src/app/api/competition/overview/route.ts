import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { botDisplayName } from "@/lib/bots/identities";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";
import { competitionGroupLabel } from "@/lib/competition/group-names";
import {
  calculateGroupStandings,
  compareStandingRows,
  type GroupAssignment,
  type GroupFixture,
  type ParticipantRoundScore,
} from "@/lib/competition/groups";
import { buildKnockoutBracket, type KnockoutDuel, type KnockoutPhaseId, type SeededParticipant } from "@/lib/competition/knockout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTLED_MATCH_STATUSES = new Set(["FINISHED", "VOID"]);
const COMPETITION_PHASES = new Set(["GROUP_STAGE", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"]);
const KNOCKOUT_SCORE_PHASES = new Set(["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"]);

type ScoreComponent = {
  code: string;
  label: string;
  points: number;
};

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeScoreComponents(value: unknown): ScoreComponent[] {
  if (!Array.isArray(value)) return [];
  return value.map((component) => ({
    code: typeof component?.code === "string" ? component.code : "",
    label: typeof component?.label === "string" ? component.label : "PontuaÃ§Ã£o",
    points: safeNumber(component?.points),
  }));
}

function soloBonusPoints(components: ScoreComponent[]) {
  return components
    .filter((component) => component.code.startsWith("BONUS_SOLO"))
    .reduce((sum, component) => sum + component.points, 0);
}

export async function GET() {
  try {
    const user = await requireUser();
    await processAutomaticBotGuessesSafely();
    const [assignmentSnap, fixtureSnap, matchesSnap, guessesSnap, eventsSnap, configSnap, carismaSnap, teamsSnap] = await Promise.all([
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("participantGroupFixtures").get(),
      adminDb.collection("matches").get(),
      adminDb.collection("guesses").get(),
      adminDb.collection("scoreEvents").where("active", "==", true).get(),
      adminDb.collection("competitionConfig").doc("main").get(),
      adminDb.collection("carismaSelections").get(),
      adminDb.collection("teams").get(),
    ]);

    const assignments = assignmentSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        displayName: data.type === "BOT"
          ? botDisplayName({ id: doc.id, fallback: typeof data.displayName === "string" ? data.displayName : doc.id })
          : data.displayName,
      };
    }) as GroupAssignment[];
    const fixtures = fixtureSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as GroupFixture[];
    const carismaIndex = buildCarismaSelectionIndex(carismaSnap.docs.map((doc) => doc.data()));
    const teamsById = new Map(teamsSnap.docs.map((doc) => [doc.id, doc.data()]));

    function carismaTeamForSelection(selection: { teamId: string; teamName: string | null; teamIso2: string | null }) {
      const team = teamsById.get(selection.teamId);
      return {
        id: selection.teamId,
        name: selection.teamName || (typeof team?.name === "string" ? team.name : selection.teamId),
        iso2: selection.teamIso2 || (typeof team?.iso2 === "string" ? team.iso2 : null),
      };
    }

    function enrichParticipant<T extends { id: string; displayName?: string; type?: string }>(row: T) {
      const selection = carismaIndex.canonicalGroupByParticipant.get(row.id);
      if (!selection) return row;
      return {
        ...row,
        carismaTeam: carismaTeamForSelection(selection),
      };
    }

    function enrichParticipantForRound<T extends { id: string; displayName?: string; type?: string }>(row: T, roundId: KnockoutPhaseId) {
      const selection = carismaIndex.byRoundParticipant.get(`${roundId}:${row.id}`);
      return {
        ...row,
        carismaTeam: selection ? carismaTeamForSelection(selection) : null,
      };
    }

    function enrichSeed(row: SeededParticipant | null, roundId: KnockoutPhaseId) {
      return row ? enrichParticipantForRound(row, roundId) : null;
    }

    function enrichDuel(duel: KnockoutDuel) {
      const displayRoundId = duel.scoringPhases[0] ?? "ROUND_OF_32";
      return {
        ...duel,
        home: { ...duel.home, participant: enrichSeed(duel.home.participant, displayRoundId) },
        away: { ...duel.away, participant: enrichSeed(duel.away.participant, displayRoundId) },
        winner: enrichSeed(duel.winner, displayRoundId),
      };
    }

    const enrichedAssignments = assignments.map(enrichParticipant);
    const matchRound = new Map<string, 1 | 2 | 3>();
    const matchMeta = new Map<string, {
      phase: string;
      round: 1 | 2 | 3 | null;
      matchNumber: number;
      homeTeamName: string;
      awayTeamName: string;
      homeScore: number | null;
      awayScore: number | null;
    }>();
    const roundStatuses = new Map<number, string[]>();
    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      const phase = String(data.phase ?? "");
      const round = Number(data.groupRound) as 1 | 2 | 3;
      const groupRound = phase === "GROUP_STAGE" && [1, 2, 3].includes(round) ? round : null;
      matchMeta.set(doc.id, {
        phase,
        round: groupRound,
        matchNumber: Number(data.matchNumber ?? 0),
        homeTeamName: String(data.homeTeamName ?? data.homeTeamId ?? "Mandante"),
        awayTeamName: String(data.awayTeamName ?? data.awayTeamId ?? "Visitante"),
        homeScore: optionalScore(data.homeScore120 ?? data.homeScore90 ?? data.liveHomeScore),
        awayScore: optionalScore(data.awayScore120 ?? data.awayScore90 ?? data.liveAwayScore),
      });
      if (groupRound) {
        matchRound.set(doc.id, groupRound);
        const statuses = roundStatuses.get(groupRound) ?? [];
        statuses.push(String(data.status ?? "SCHEDULED"));
        roundStatuses.set(groupRound, statuses);
      }
    }

    const guessesById = new Map(guessesSnap.docs.map((doc) => {
      const data = doc.data();
      return [doc.id, {
        homeScore: optionalScore(data.homeScore),
        awayScore: optionalScore(data.awayScore),
      }];
    }));

    const scoreMap = new Map<string, ParticipantRoundScore>();
    const bestByMatchParticipant = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const participantId = String(data.participantId ?? "");
      const matchId = String(data.matchId ?? "");
      const phase = matchMeta.get(matchId)?.phase;
      if (!participantId || !phase || !COMPETITION_PHASES.has(phase)) continue;
      const key = `${matchId}:${participantId}`;
      const current = bestByMatchParticipant.get(key);
      if (!current || Number(data.totalPoints ?? 0) > Number(current.totalPoints ?? 0)) {
        bestByMatchParticipant.set(key, data);
      }
    }
    const raceTotals = new Map<string, { totalPoints: number; exactHits: number; soloHits: number; scoredHits: number }>();
    const exactDetailsByParticipant = new Map<string, Array<{
      matchId: string;
      matchNumber: number;
      matchLabel: string;
      guess: { home: number; away: number } | null;
      result: { home: number; away: number } | null;
      exact: boolean;
      exactPoints: number;
      solo: boolean;
      soloPoints: number;
      totalPoints: number;
    }>>();
    const phaseScores = new Map<string, { participantId: string; phase: "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL"; points: number; exactHits: number }>();
    for (const data of bestByMatchParticipant.values()) {
      const matchId = String(data.matchId);
      const meta = matchMeta.get(matchId);
      if (!meta) continue;
      const round = meta.round;
      const participantId = String(data.participantId);
      if (!participantId) continue;
      const totalPoints = safeNumber(data.totalPoints);
      const exactHit = data.baseCode === "BASE_EXACT_SCORE" ? 1 : 0;
      const components = normalizeScoreComponents(data.components);
      const soloPoints = soloBonusPoints(components);
      const race = raceTotals.get(participantId) ?? { totalPoints: 0, exactHits: 0, soloHits: 0, scoredHits: 0 };
      race.totalPoints += totalPoints;
      race.exactHits += exactHit;
      race.soloHits += soloPoints > 0 ? 1 : 0;
      race.scoredHits += totalPoints > 0 ? 1 : 0;
      raceTotals.set(participantId, race);

      if (exactHit || soloPoints > 0) {
        const guessId = typeof data.guessId === "string" ? data.guessId : "";
        const guess = guessesById.get(guessId);
        const details = exactDetailsByParticipant.get(participantId) ?? [];
        details.push({
          matchId,
          matchNumber: meta.matchNumber,
          matchLabel: `${meta.homeTeamName} x ${meta.awayTeamName}`,
          guess: guess?.homeScore != null && guess.awayScore != null
            ? { home: guess.homeScore, away: guess.awayScore }
            : null,
          result: meta.homeScore != null && meta.awayScore != null
            ? { home: meta.homeScore, away: meta.awayScore }
            : null,
          exact: Boolean(exactHit),
          exactPoints: exactHit ? Math.max(0, totalPoints - soloPoints) : 0,
          solo: soloPoints > 0,
          soloPoints,
          totalPoints,
        });
        details.sort((a, b) => a.matchNumber - b.matchNumber);
        exactDetailsByParticipant.set(participantId, details);
      }

      if (round) {
        const key = `${participantId}:${round}`;
        const row = scoreMap.get(key) ?? { participantId, round, points: 0, exactHits: 0 };
        row.points += totalPoints;
        row.exactHits += exactHit;
        scoreMap.set(key, row);
      }

      if (KNOCKOUT_SCORE_PHASES.has(meta.phase)) {
        const phase = meta.phase as "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL";
        const key = `${participantId}:${phase}`;
        const current = phaseScores.get(key) ?? { participantId, phase, points: 0, exactHits: 0 };
        current.points += totalPoints;
        current.exactHits += exactHit;
        phaseScores.set(key, current);
      }
    }

    // Uma rodada passa a aparecer provisoriamente assim que o primeiro resultado
    // é confirmado. Os pontos de tabela ainda podem mudar até o último jogo.
    const startedRounds = new Set<number>();
    const completedRounds = new Set<number>();
    const roundProgress = [1, 2, 3].map((round) => {
      const statuses = roundStatuses.get(round) ?? [];
      const settled = statuses.filter((status) => SETTLED_MATCH_STATUSES.has(status)).length;
      const total = statuses.length;
      if (settled > 0) startedRounds.add(round);
      if (total > 0 && settled === total) completedRounds.add(round);
      return { round, settled, total, completed: total > 0 && settled === total };
    });

    const standings = calculateGroupStandings(assignments, fixtures, [...scoreMap.values()], startedRounds);
    const groups = ["A", "B", "C", "D"].map((groupId) => {
      const rows = standings
        .filter((row) => row.groupId === groupId)
        .sort(compareStandingRows)
        .map(enrichParticipant);
      const groupFixtures = fixtures
        .filter((fixture) => fixture.groupId === groupId)
        .map((fixture) => ({
          ...fixture,
          home: enrichedAssignments.find((item) => item.id === fixture.homeParticipantId) ?? null,
          away: enrichedAssignments.find((item) => item.id === fixture.awayParticipantId) ?? null,
          homeRoundPoints: scoreMap.get(`${fixture.homeParticipantId}:${fixture.round}`)?.points ?? 0,
          awayRoundPoints: scoreMap.get(`${fixture.awayParticipantId}:${fixture.round}`)?.points ?? 0,
          started: startedRounds.has(fixture.round),
          completed: completedRounds.has(fixture.round),
        }));
      return { id: groupId, name: competitionGroupLabel(groupId), rows, fixtures: groupFixtures };
    });

    const groupStageComplete = completedRounds.size === 3;
    const pointsRace = enrichedAssignments
      .map((participant) => ({
        ...participant,
        totalPoints: raceTotals.get(participant.id)?.totalPoints ?? 0,
        exactHits: raceTotals.get(participant.id)?.exactHits ?? 0,
        soloHits: raceTotals.get(participant.id)?.soloHits ?? 0,
        scoredHits: raceTotals.get(participant.id)?.scoredHits ?? 0,
        exactDetails: exactDetailsByParticipant.get(participant.id) ?? [],
        racePosition: 0,
      }))
      .sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.exactHits - a.exactHits ||
        String(a.displayName ?? a.id).localeCompare(String(b.displayName ?? b.id), "pt-BR")
      )
      .map((participant, index) => ({ ...participant, racePosition: index + 1 }));
    const rawKnockout = groupStageComplete ? buildKnockoutBracket(standings, [...phaseScores.values()], pointsRace) : null;
    const knockout = rawKnockout
      ? {
          seeds: rawKnockout.seeds.map(enrichParticipant),
          opening: rawKnockout.opening.map(enrichDuel),
          quarterFinals: rawKnockout.quarterFinals.map(enrichDuel),
          semiFinals: rawKnockout.semiFinals.map(enrichDuel),
          final: {
            ...rawKnockout.final,
            finalists: rawKnockout.final.finalists.map((row) => enrichSeed(row, "FINAL")),
            pointsRaceWildcard: rawKnockout.final.pointsRaceWildcard
              ? enrichParticipantForRound(rawKnockout.final.pointsRaceWildcard, "FINAL")
              : null,
          },
          pointsRace,
          note: "Todos os 16 participantes entram nos 16-avos. O primeiro duelo soma 16-avos e oitavas; a final tem os dois sobreviventes do mata-mata e o melhor dos pontos corridos fora da final.",
        }
      : {
          seeds: [],
          opening: [],
          quarterFinals: [],
          semiFinals: [],
          final: { scoringLabel: "Final", scoringPhases: ["FINAL"], finalists: [], pointsRaceWildcard: null },
          pointsRace,
          note: "O chaveamento será exibido quando as três rodadas da fase de grupos forem concluídas.",
        };
    const config = configSnap.data() ?? {};

    return NextResponse.json({
      competitionName: config.name ?? "Mundial Snickers do Carisma",
      currentUserId: user.uid,
      groupDrawCompleted: Boolean(config.groupDrawCompleted),
      carismaDrawCompleted: Boolean(config.carismaDrawCompleted),
      startedRounds: [...startedRounds],
      completedRounds: [...completedRounds],
      roundProgress,
      groupStageComplete,
      groups,
      knockout,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("competition-overview", error);
    return NextResponse.json({ error: "Não foi possível carregar a classificação." }, { status: 500 });
  }
}
