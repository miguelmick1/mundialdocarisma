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
import { buildKnockoutBracket, type KnockoutDuel, type SeededParticipant } from "@/lib/competition/knockout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTLED_MATCH_STATUSES = new Set(["FINISHED", "VOID"]);
const COMPETITION_PHASES = new Set(["GROUP_STAGE", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"]);
const KNOCKOUT_SCORE_PHASES = new Set(["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"]);

export async function GET() {
  try {
    const user = await requireUser();
    await processAutomaticBotGuessesSafely();
    const [assignmentSnap, fixtureSnap, matchesSnap, eventsSnap, configSnap, carismaSnap, teamsSnap] = await Promise.all([
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("participantGroupFixtures").get(),
      adminDb.collection("matches").get(),
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

    function enrichParticipant<T extends { id: string; displayName?: string; type?: string }>(row: T) {
      const selection = carismaIndex.canonicalGroupByParticipant.get(row.id);
      if (!selection) return row;
      const team = teamsById.get(selection.teamId);
      return {
        ...row,
        carismaTeam: {
          id: selection.teamId,
          name: selection.teamName || (typeof team?.name === "string" ? team.name : selection.teamId),
          iso2: selection.teamIso2 || (typeof team?.iso2 === "string" ? team.iso2 : null),
        },
      };
    }

    function enrichSeed(row: SeededParticipant | null) {
      return row ? enrichParticipant(row) : null;
    }

    function enrichDuel(duel: KnockoutDuel) {
      return {
        ...duel,
        home: { ...duel.home, participant: enrichSeed(duel.home.participant) },
        away: { ...duel.away, participant: enrichSeed(duel.away.participant) },
        winner: enrichSeed(duel.winner),
      };
    }

    const enrichedAssignments = assignments.map(enrichParticipant);
    const matchRound = new Map<string, 1 | 2 | 3>();
    const matchMeta = new Map<string, { phase: string; round: 1 | 2 | 3 | null }>();
    const roundStatuses = new Map<number, string[]>();
    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      const phase = String(data.phase ?? "");
      const round = Number(data.groupRound) as 1 | 2 | 3;
      const groupRound = phase === "GROUP_STAGE" && [1, 2, 3].includes(round) ? round : null;
      matchMeta.set(doc.id, { phase, round: groupRound });
      if (groupRound) {
        matchRound.set(doc.id, groupRound);
        const statuses = roundStatuses.get(groupRound) ?? [];
        statuses.push(String(data.status ?? "SCHEDULED"));
        roundStatuses.set(groupRound, statuses);
      }
    }

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
    const raceTotals = new Map<string, { totalPoints: number; exactHits: number }>();
    const phaseScores = new Map<string, { participantId: string; phase: "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL"; points: number; exactHits: number }>();
    for (const data of bestByMatchParticipant.values()) {
      const matchId = String(data.matchId);
      const meta = matchMeta.get(matchId);
      if (!meta) continue;
      const round = meta.round;
      const participantId = String(data.participantId);
      if (!participantId) continue;
      const totalPoints = Number(data.totalPoints ?? 0);
      const exactHit = data.baseCode === "BASE_EXACT_SCORE" ? 1 : 0;
      const race = raceTotals.get(participantId) ?? { totalPoints: 0, exactHits: 0 };
      race.totalPoints += totalPoints;
      race.exactHits += exactHit;
      raceTotals.set(participantId, race);

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
            finalists: rawKnockout.final.finalists.map(enrichSeed),
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
