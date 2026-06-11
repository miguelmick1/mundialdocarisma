import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { calculateMatchScores } from "@/lib/scoring/match";
import { carismaRoundIdForMatch } from "@/lib/world-cup/rounds";
import { botDisplayName } from "@/lib/bots/identities";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Participant = { id: string; displayName: string; type: "HUMAN" | "BOT"; avatarUrl: string | null };
type GuessRow = { slot: number; homeScore: number; awayScore: number; source?: string };
type ScoreEvent = { slot?: number; totalPoints?: number; baseCode?: string; components?: Array<{ code?: string; label?: string; points?: number }> };

type CalculatedRow = {
  slot: number;
  totalPoints: number;
  baseCode: string | null;
  components: Array<{ code: string; label: string; points: number }>;
};

const LIVE_STATUSES = new Set(["LIVE", "HALFTIME", "EXTRA_TIME"]);

function phaseLabel(phase: string, group?: string | null, groupRound?: number | null) {
  if (phase === "GROUP_STAGE") return `Grupo ${group ?? "-"} · Rodada ${groupRound ?? "-"}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinal",
    THIRD_PLACE: "3º lugar",
    FINAL: "Final",
    DEMO: "Demonstração"
  };
  return labels[phase] ?? phase;
}

function normalizeComponents(components: ScoreEvent["components"]) {
  return (components ?? []).map((component) => ({
    code: component.code ?? "",
    label: component.label ?? component.code ?? "Pontuação",
    points: Number(component.points ?? 0)
  }));
}

export async function GET() {
  try {
    await requireUser();

    const [matchesSnap, usersSnap, participantsSnap, guessesSnap, eventsSnap, carismaSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("users").get(),
      adminDb.collection("participants").get(),
      adminDb.collection("guesses").get(),
      adminDb.collection("scoreEvents").get(),
      adminDb.collection("carismaSelections").get()
    ]);

    const participants = new Map<string, Participant>();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.status === "INACTIVE") continue;
      participants.set(doc.id, {
        id: doc.id,
        displayName: typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : typeof data.email === "string" ? data.email : "Participante",
        type: "HUMAN",
        avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null
      });
    }
    for (const doc of participantsSnap.docs) {
      const data = doc.data();
      if (data.type !== "BOT" || data.status === "INACTIVE") continue;
      participants.set(doc.id, {
        id: doc.id,
        displayName: botDisplayName({
          id: doc.id,
          strategy: typeof data.botStrategy === "string" ? data.botStrategy : undefined,
          fallback: typeof data.displayName === "string" ? data.displayName : doc.id,
        }),
        type: "BOT",
        avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null
      });
    }

    const guessesByMatch = new Map<string, Map<string, GuessRow[]>>();
    for (const doc of guessesSnap.docs) {
      const data = doc.data();
      const matchId = String(data.matchId ?? "");
      const participantId = String(data.participantId ?? "");
      if (!matchId || !participantId) continue;
      const byParticipant = guessesByMatch.get(matchId) ?? new Map<string, GuessRow[]>();
      const rows = byParticipant.get(participantId) ?? [];
      rows.push({
        slot: Number(data.slot ?? 1),
        homeScore: Number(data.homeScore ?? 0),
        awayScore: Number(data.awayScore ?? 0),
        source: typeof data.source === "string" ? data.source : undefined
      });
      rows.sort((a, b) => a.slot - b.slot);
      byParticipant.set(participantId, rows);
      guessesByMatch.set(matchId, byParticipant);
      if (!participants.has(participantId)) {
        participants.set(participantId, {
          id: participantId,
          displayName: typeof data.participantName === "string" ? data.participantName : participantId,
          type: data.source === "HUMAN" ? "HUMAN" : "BOT",
          avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null
        });
      }
    }

    const eventsByMatch = new Map<string, Map<string, ScoreEvent[]>>();
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      if (data.active !== true) continue;
      const matchId = String(data.matchId ?? "");
      const participantId = String(data.participantId ?? "");
      if (!matchId || !participantId) continue;
      const byParticipant = eventsByMatch.get(matchId) ?? new Map<string, ScoreEvent[]>();
      const rows = byParticipant.get(participantId) ?? [];
      rows.push({
        slot: Number(data.slot ?? 1),
        totalPoints: Number(data.totalPoints ?? 0),
        baseCode: typeof data.baseCode === "string" ? data.baseCode : undefined,
        components: Array.isArray(data.components) ? data.components : []
      });
      byParticipant.set(participantId, rows);
      eventsByMatch.set(matchId, byParticipant);
    }

    const carismaIndex = buildCarismaSelectionIndex(carismaSnap.docs.map((doc) => doc.data()));
    const carismaByRoundParticipant = new Map(
      [...carismaIndex.byRoundParticipant.entries()].map(([key, selection]) => [key, selection.teamId]),
    );

    const participantList = [...participants.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    const availableStatuses = new Set(["LIVE", "HALFTIME", "EXTRA_TIME", "FINISHED_PROVISIONAL", "FINISHED", "VOID"]);

    const matches = matchesSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter(({ data }) => availableStatuses.has(data.status) || data.scoringStatus === "CALCULATED" || data.scoringStatus === "VOID")
      .map(({ id, data }) => {
        const matchGuesses = guessesByMatch.get(id) ?? new Map<string, GuessRow[]>();
        const matchEvents = eventsByMatch.get(id) ?? new Map<string, ScoreEvent[]>();
        const isVoid = data.status === "VOID" || data.scoringStatus === "VOID";
        const isConfirmed = data.status === "FINISHED" || data.scoringStatus === "CALCULATED";
        const isLive = LIVE_STATUSES.has(data.status);
        const isProvisional = data.status === "FINISHED_PROVISIONAL";
        const homeScore = isLive
          ? data.liveHomeScore ?? null
          : data.homeScore120 ?? data.homeScore90 ?? data.liveHomeScore ?? null;
        const awayScore = isLive
          ? data.liveAwayScore ?? null
          : data.awayScore120 ?? data.awayScore90 ?? data.liveAwayScore ?? null;
        const actualAvailable = typeof homeScore === "number" && typeof awayScore === "number";
        const roundId = data.competitionRoundId ?? carismaRoundIdForMatch(data.phase, data.groupRound);
        const provisionalScoresByParticipant = new Map<string, CalculatedRow[]>();

        if (!isVoid && !isConfirmed && actualAvailable) {
          const provisionalScores = calculateMatchScores({
            actual: { home: homeScore, away: awayScore },
            homeTeamId: data.homeTeamId,
            awayTeamId: data.awayTeamId,
            guesses: [...matchGuesses.entries()].flatMap(([participantId, guesses]) =>
              guesses.map((guess) => ({
                participantId,
                slot: guess.slot,
                source: guess.source ?? (participants.get(participantId)?.type === "BOT" ? "BOT_AUTOMATIC" : "HUMAN"),
                guess: { home: guess.homeScore, away: guess.awayScore },
                carismaTeamId: roundId ? carismaByRoundParticipant.get(`${roundId}:${participantId}`) : undefined
              }))
            )
          });
          provisionalScores.forEach((entry) => {
            const rows = provisionalScoresByParticipant.get(entry.participantId) ?? [];
            rows.push({
              slot: entry.slot,
              totalPoints: entry.result.total,
              baseCode: entry.baseCode,
              components: entry.result.components
            });
            provisionalScoresByParticipant.set(entry.participantId, rows);
          });
        }

        const rows = participantList.map((participant) => {
          const guesses = matchGuesses.get(participant.id) ?? [];
          let calculated: CalculatedRow[] = [];

          if (isVoid) {
            calculated = [];
          } else if (isConfirmed) {
            calculated = (matchEvents.get(participant.id) ?? []).map((event) => ({
              slot: Number(event.slot ?? 1),
              totalPoints: Number(event.totalPoints ?? 0),
              baseCode: event.baseCode ?? null,
              components: normalizeComponents(event.components)
            }));
          } else if (actualAvailable) {
            calculated = provisionalScoresByParticipant.get(participant.id) ?? [];
          }

          const best = [...calculated].sort((a, b) => b.totalPoints - a.totalPoints || a.slot - b.slot)[0] ?? null;
          const components = best?.components ?? [];
          const baseLabel = isVoid
            ? "Partida anulada"
            : components[0]?.label ?? (guesses.length ? (actualAvailable ? "Sem pontuação" : "Aguardando placar") : "Sem palpite");

          return {
            participantId: participant.id,
            displayName: participant.displayName,
            participantType: participant.type,
            avatarUrl: participant.avatarUrl,
            guesses,
            selectedSlot: best?.slot ?? null,
            totalPoints: best?.totalPoints ?? 0,
            baseCode: best?.baseCode ?? null,
            baseLabel,
            components
          };
        }).sort((a, b) =>
          b.totalPoints - a.totalPoints ||
          Number(b.baseCode === "BASE_EXACT_SCORE") - Number(a.baseCode === "BASE_EXACT_SCORE") ||
          a.displayName.localeCompare(b.displayName, "pt-BR")
        );

        let lastPoints: number | null = null;
        let lastPosition = 0;
        const rankedRows = rows.map((row, index) => {
          if (lastPoints === null || row.totalPoints !== lastPoints) lastPosition = index + 1;
          lastPoints = row.totalPoints;
          return { ...row, position: lastPosition };
        });

        const kickoffAt = data.kickoffAt?.toDate?.() as Date | undefined;
        const updatedAt = data.liveUpdatedAt?.toDate?.() as Date | undefined;
        return {
          matchId: id,
          matchNumber: Number(data.matchNumber ?? 0),
          phase: String(data.phase ?? ""),
          phaseLabel: phaseLabel(String(data.phase ?? ""), data.group ?? null, data.groupRound ?? null),
          group: data.group ?? null,
          groupRound: data.groupRound ?? null,
          kickoffAt: kickoffAt?.toISOString() ?? null,
          venue: data.venue ?? null,
          status: isVoid ? "VOID" : data.status,
          scoringStatus: data.scoringStatus ?? "PENDING",
          isLive,
          isProvisional,
          isConfirmed,
          livePeriod: data.livePeriod ?? null,
          liveMinute: data.liveMinute ?? null,
          updatedAt: updatedAt?.toISOString() ?? null,
          resultSource: data.resultSource ?? null,
          homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "Mandante",
          awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "Visitante",
          homeTeamIso2: data.homeTeamIso2 ?? null,
          awayTeamIso2: data.awayTeamIso2 ?? null,
          homeScore,
          awayScore,
          rows: rankedRows
        };
      })
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        const aTime = a.kickoffAt ? new Date(a.kickoffAt).getTime() : 0;
        const bTime = b.kickoffAt ? new Date(b.kickoffAt).getTime() : 0;
        return bTime - aTime;
      });

    return NextResponse.json({
      matches,
      liveCount: matches.filter((match) => match.isLive).length,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("results-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os resultados." }, { status: 500 });
  }
}
