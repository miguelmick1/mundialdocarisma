import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Participant = {
  id: string;
  displayName: string;
  type: "HUMAN" | "BOT";
};

type GuessRow = {
  slot: number;
  homeScore: number;
  awayScore: number;
  source?: string;
};

type ScoreEvent = {
  slot?: number;
  totalPoints?: number;
  baseCode?: string;
  components?: Array<{ code?: string; label?: string; points?: number }>;
};

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

export async function GET() {
  try {
    await requireUser();

    const [matchesSnap, usersSnap, participantsSnap, guessesSnap, eventsSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("users").get(),
      adminDb.collection("participants").get(),
      adminDb.collection("guesses").get(),
      adminDb.collection("scoreEvents").get()
    ]);

    const participants = new Map<string, Participant>();

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.status === "INACTIVE") continue;
      participants.set(doc.id, {
        id: doc.id,
        displayName: typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : typeof data.email === "string"
            ? data.email
            : "Participante",
        type: "HUMAN"
      });
    }

    for (const doc of participantsSnap.docs) {
      const data = doc.data();
      if (data.type !== "BOT" || data.status === "INACTIVE") continue;
      participants.set(doc.id, {
        id: doc.id,
        displayName: typeof data.displayName === "string" ? data.displayName : doc.id,
        type: "BOT"
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
          type: data.source === "HUMAN" ? "HUMAN" : "BOT"
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

    const participantList = [...participants.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));

    const matches = matchesSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter(({ data }) => data.status === "FINISHED" || data.status === "VOID" || data.scoringStatus === "CALCULATED" || data.scoringStatus === "VOID")
      .map(({ id, data }) => {
        const matchGuesses = guessesByMatch.get(id) ?? new Map<string, GuessRow[]>();
        const matchEvents = eventsByMatch.get(id) ?? new Map<string, ScoreEvent[]>();
        const isVoid = data.status === "VOID" || data.scoringStatus === "VOID";
        const homeScore = data.homeScore120 ?? data.homeScore90 ?? null;
        const awayScore = data.awayScore120 ?? data.awayScore90 ?? null;

        const rows = participantList.map((participant) => {
          const guesses = matchGuesses.get(participant.id) ?? [];
          const events = matchEvents.get(participant.id) ?? [];
          const bestEvent = isVoid
            ? null
            : [...events].sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || (a.slot ?? 1) - (b.slot ?? 1))[0] ?? null;
          const totalPoints = bestEvent?.totalPoints ?? 0;
          const components = (bestEvent?.components ?? []).map((component) => ({
            code: component.code ?? "",
            label: component.label ?? component.code ?? "Pontuação",
            points: Number(component.points ?? 0)
          }));
          const baseLabel = isVoid
            ? "Partida anulada"
            : components[0]?.label ?? (guesses.length ? "Sem pontuação" : "Sem palpite");

          return {
            participantId: participant.id,
            displayName: participant.displayName,
            participantType: participant.type,
            guesses,
            selectedSlot: bestEvent?.slot ?? null,
            totalPoints,
            baseCode: bestEvent?.baseCode ?? null,
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
        return {
          matchId: id,
          matchNumber: Number(data.matchNumber ?? 0),
          phase: String(data.phase ?? ""),
          phaseLabel: phaseLabel(String(data.phase ?? ""), data.group ?? null, data.groupRound ?? null),
          group: data.group ?? null,
          groupRound: data.groupRound ?? null,
          kickoffAt: kickoffAt?.toISOString() ?? null,
          venue: data.venue ?? null,
          status: isVoid ? "VOID" : "FINISHED",
          homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "Mandante",
          awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "Visitante",
          homeTeamIso2: data.homeTeamIso2 ?? null,
          awayTeamIso2: data.awayTeamIso2 ?? null,
          homeScore,
          awayScore,
          rows: rankedRows
        };
      })
      .reverse();

    return NextResponse.json({ matches, updatedAt: new Date().toISOString() });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("results-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os resultados." }, { status: 500 });
  }
}
