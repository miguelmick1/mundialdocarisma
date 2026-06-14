import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { botDisplayName } from "@/lib/bots/identities";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { carismaRoundIdForMatch } from "@/lib/world-cup/rounds";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Participant = {
  id: string;
  displayName: string;
  type: "HUMAN" | "BOT";
  avatarUrl: string | null;
};

type PublicGuess = {
  guessId: string;
  slot: number;
  homeScore: number;
  awayScore: number;
  administrativelyEntered: boolean;
};

type PublicScore = {
  totalPoints: number;
  baseCode: string | null;
};

function phaseLabel(phase: string, group?: string | null, groupRound?: number | null) {
  if (phase === "GROUP_STAGE") return `Grupo ${group ?? "-"} · Rodada ${groupRound ?? "-"}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinais",
    THIRD_PLACE: "3º lugar",
    FINAL: "Final",
    DEMO: "Demonstração",
  };
  return labels[phase] ?? phase;
}

export async function GET() {
  try {
    const user = await requireUser();
    await processAutomaticBotGuessesSafely();
    const [matchesSnap, usersSnap, botsSnap, guessesSnap, carismaSnap, scoreEventsSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("users").get(),
      adminDb.collection("participants").get(),
      adminDb.collection("guesses").get(),
      adminDb.collection("carismaSelections").get(),
      adminDb.collection("scoreEvents").where("active", "==", true).get(),
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
        avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
      });
    }
    for (const doc of botsSnap.docs) {
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
        avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
      });
    }

    const guessesByMatch = new Map<string, Map<string, PublicGuess[]>>();
    for (const doc of guessesSnap.docs) {
      const data = doc.data();
      const matchId = typeof data.matchId === "string" ? data.matchId : "";
      const participantId = typeof data.participantId === "string" ? data.participantId : "";
      if (!matchId || !participantId) continue;
      if (!participants.has(participantId)) {
        participants.set(participantId, {
          id: participantId,
          displayName: typeof data.participantName === "string" ? data.participantName : participantId,
          type: data.source === "HUMAN" ? "HUMAN" : "BOT",
          avatarUrl: null,
        });
      }
      const byParticipant = guessesByMatch.get(matchId) ?? new Map<string, PublicGuess[]>();
      const guesses = byParticipant.get(participantId) ?? [];
      guesses.push({
        guessId: doc.id,
        slot: Number(data.slot ?? 1),
        homeScore: Number(data.homeScore ?? 0),
        awayScore: Number(data.awayScore ?? 0),
        administrativelyEntered: typeof data.overriddenByUid === "string" && Boolean(data.overriddenByUid),
      });
      guesses.sort((a, b) => a.slot - b.slot);
      byParticipant.set(participantId, guesses);
      guessesByMatch.set(matchId, byParticipant);
    }

    // A classificação considera o melhor palpite do participante em cada jogo.
    // A mesma regra é usada nesta tela para informar quantos pontos ele fez.
    const scoresByMatch = new Map<string, Map<string, PublicScore>>();
    for (const doc of scoreEventsSnap.docs) {
      const data = doc.data();
      const matchId = String(data.matchId ?? "").trim();
      const participantId = String(data.participantId ?? "").trim();
      const totalPoints = Number(data.totalPoints ?? 0);
      if (!matchId || !participantId || !Number.isFinite(totalPoints)) continue;
      const byParticipant = scoresByMatch.get(matchId) ?? new Map<string, PublicScore>();
      const current = byParticipant.get(participantId);
      if (!current || totalPoints > current.totalPoints) {
        byParticipant.set(participantId, {
          totalPoints,
          baseCode: typeof data.baseCode === "string" ? data.baseCode : null,
        });
      }
      scoresByMatch.set(matchId, byParticipant);
    }

    const participantList = [...participants.values()].sort((a, b) =>
      Number(a.type === "BOT") - Number(b.type === "BOT") || a.displayName.localeCompare(b.displayName, "pt-BR"),
    );
    const carismaIndex = buildCarismaSelectionIndex(carismaSnap.docs.map((doc) => doc.data()));
    const now = Date.now();

    const matches = matchesSnap.docs
      .filter((doc) => doc.data().phase !== "DEMO" && Number(doc.data().matchNumber ?? 0) > 0)
      .map((doc) => {
        const data = doc.data();
        const kickoff = data.kickoffAt?.toDate?.() as Date | undefined;
        const revealed = Boolean(kickoff && (now >= kickoff.getTime() || data.status !== "SCHEDULED"));
        const roundId = data.competitionRoundId ?? carismaRoundIdForMatch(String(data.phase ?? ""), data.groupRound ?? null);
        const byParticipant = guessesByMatch.get(doc.id) ?? new Map<string, PublicGuess[]>();
        const scores = scoresByMatch.get(doc.id) ?? new Map<string, PublicScore>();
        const resultCalculated = data.scoringStatus === "CALCULATED" || data.status === "FINISHED";
        const finalHomeScore = data.homeScore120 ?? data.homeScore90 ?? data.liveHomeScore ?? null;
        const finalAwayScore = data.awayScore120 ?? data.awayScore90 ?? data.liveAwayScore ?? null;
        return {
          matchId: doc.id,
          matchNumber: Number(data.matchNumber ?? 0),
          phase: String(data.phase ?? ""),
          phaseLabel: phaseLabel(String(data.phase ?? ""), data.group ?? null, data.groupRound ?? null),
          group: data.group ?? null,
          groupRound: data.groupRound ?? null,
          kickoffAt: kickoff?.toISOString() ?? null,
          status: String(data.status ?? "SCHEDULED"),
          scoringStatus: String(data.scoringStatus ?? "PENDING"),
          resultCalculated,
          finalScore: resultCalculated && finalHomeScore != null && finalAwayScore != null
            ? { home: Number(finalHomeScore), away: Number(finalAwayScore) }
            : null,
          venue: data.venue ?? null,
          homeTeamId: String(data.homeTeamId ?? ""),
          awayTeamId: String(data.awayTeamId ?? ""),
          homeTeamName: String(data.homeTeamName ?? data.homeTeamId ?? "Mandante"),
          awayTeamName: String(data.awayTeamName ?? data.awayTeamId ?? "Visitante"),
          homeTeamIso2: data.homeTeamIso2 ?? null,
          awayTeamIso2: data.awayTeamIso2 ?? null,
          revealed,
          revealAt: kickoff?.toISOString() ?? null,
          rows: revealed ? participantList.map((participant) => {
            const selection = roundId
              ? carismaIndex.byRoundParticipant.get(`${roundId}:${participant.id}`)
              : undefined;
            const score = scores.get(participant.id);
            return {
              participantId: participant.id,
              displayName: participant.displayName,
              participantType: participant.type,
              avatarUrl: participant.avatarUrl,
              guesses: byParticipant.get(participant.id) ?? [],
              points: resultCalculated ? score?.totalPoints ?? 0 : null,
              baseCode: resultCalculated ? score?.baseCode ?? null : null,
              carismaTeamId: selection?.teamId ?? null,
              isCarismaMatch: Boolean(selection && [data.homeTeamId, data.awayTeamId].includes(selection.teamId)),
            };
          }) : [],
        };
      });

    return NextResponse.json({
      currentUserId: user.uid,
      matches,
      participantCount: participantList.length,
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("public-guesses", error);
    return NextResponse.json({ error: "Não foi possível carregar os palpites dos participantes." }, { status: 500 });
  }
}
