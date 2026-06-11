import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { botDisplayName, botGuessMode, botGuessingEnabled, type BotGuessMode } from "@/lib/bots/identities";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import {
  CARISMA_ROUND_LABELS,
  KNOCKOUT_ROUNDS,
  type CarismaRoundId,
} from "@/lib/world-cup/rounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BotOption = {
  id: string;
  name: string;
  strategy: string;
  guessMode: BotGuessMode;
  guessingEnabled: boolean;
};

type CarismaTeamOption = {
  id: string;
  name: string;
  iso2: string | null;
  group: string | null;
  eligible: boolean;
  unavailableReason: string | null;
  firstKickoff: string | null;
};

const DEFAULT_BOTS: BotOption[] = [
  { id: "bot-oddmestre", name: "Betinho Everyday", strategy: "ODD_MASTER", guessMode: "MANUAL", guessingEnabled: true },
  { id: "bot-maria", name: "Maria Vai com as Outras", strategy: "HUMAN_AVERAGE", guessMode: "AUTOMATIC", guessingEnabled: true },
  { id: "bot-faria", name: "Transbot", strategy: "FARIA_LIMMER", guessMode: "MANUAL", guessingEnabled: true },
  { id: "bot-pangare", name: "Pangaré", strategy: "PANGARE", guessMode: "AUTOMATIC", guessingEnabled: true },
];

const ADMIN_CARISMA_ROUNDS: CarismaRoundId[] = ["GROUP_1", ...KNOCKOUT_ROUNDS];

function matchBelongsToAdminCarismaRound(match: FirebaseFirestore.DocumentData, roundId: CarismaRoundId) {
  return roundId === "GROUP_1" ? match.phase === "GROUP_STAGE" : match.phase === roundId;
}

function buildBotCarismaRounds(params: {
  botId: string;
  matchDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  teamDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  selectionDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  now: number;
}) {
  const teamsById = new Map(params.teamDocs.map((doc) => [doc.id, doc.data()]));
  const selectionIndex = buildCarismaSelectionIndex(params.selectionDocs.map((doc) => doc.data()));

  return ADMIN_CARISMA_ROUNDS.map((roundId) => {
    const firstKickoffByTeam = new Map<string, number>();
    const groupByTeam = new Map<string, string | null>();

    for (const doc of params.matchDocs) {
      const match = doc.data();
      if (!matchBelongsToAdminCarismaRound(match, roundId) || match.teamsResolved === false) continue;
      const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
      if (!kickoff) continue;
      for (const teamId of [match.homeTeamId, match.awayTeamId]) {
        if (typeof teamId !== "string" || !teamId) continue;
        const current = firstKickoffByTeam.get(teamId);
        if (current == null || kickoff.getTime() < current) firstKickoffByTeam.set(teamId, kickoff.getTime());
        if (!groupByTeam.has(teamId)) groupByTeam.set(teamId, typeof match.group === "string" ? match.group : null);
      }
    }

    const selection = selectionIndex.byRoundParticipant.get(`${roundId}:${params.botId}`);
    const selectedTeamId = selection?.teamId ?? null;
    const selectedFirstKickoff = selectedTeamId ? firstKickoffByTeam.get(selectedTeamId) ?? null : null;
    const selectionLockAt = selection?.raw.lockAt && typeof (selection.raw.lockAt as { toDate?: () => Date }).toDate === "function"
      ? (selection.raw.lockAt as { toDate: () => Date }).toDate().getTime()
      : null;
    const lockAt = selectedFirstKickoff ?? selectionLockAt;

    const teams: CarismaTeamOption[] = [...firstKickoffByTeam.entries()]
      .map(([teamId, firstKickoff]) => {
        const team = teamsById.get(teamId);
        const eliminated = team?.active === false || Boolean(team?.eliminatedAt);
        const alreadyPlayed = params.now >= firstKickoff;
        return {
          id: teamId,
          name: typeof team?.name === "string" ? team.name : teamId,
          iso2: typeof team?.iso2 === "string" ? team.iso2 : null,
          group: groupByTeam.get(teamId) ?? null,
          eligible: !eliminated && !alreadyPlayed,
          unavailableReason: eliminated ? "Seleção eliminada" : alreadyPlayed ? "Primeiro jogo já iniciado" : null,
          firstKickoff: new Date(firstKickoff).toISOString(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const selectedTeam = selectedTeamId
      ? teams.find((team) => team.id === selectedTeamId) ?? {
          id: selectedTeamId,
          name: selection?.teamName ?? selectedTeamId,
          iso2: selection?.teamIso2 ?? null,
          group: null,
          eligible: false,
          unavailableReason: "Seleção não disponível nesta fase",
          firstKickoff: null,
        }
      : null;

    return {
      id: roundId,
      label: roundId === "GROUP_1" ? "Fase de grupos · 3 rodadas" : CARISMA_ROUND_LABELS[roundId],
      selectedTeam,
      locked: lockAt !== null ? params.now >= lockAt : false,
      lockAt: lockAt !== null ? new Date(lockAt).toISOString() : null,
      teams,
      hasResolvedMatches: teams.length > 0,
      sharedAcrossGroupStage: roundId === "GROUP_1",
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    await processAutomaticBotGuessesSafely();

    const participantsSnap = await adminDb.collection("participants").where("type", "==", "BOT").get();
    const configuredBots: BotOption[] = participantsSnap.docs.map((doc) => {
      const data = doc.data();
      const strategy = typeof data.botStrategy === "string" ? data.botStrategy : "UNKNOWN";
      return {
        id: doc.id,
        name: botDisplayName({
          id: doc.id,
          strategy,
          fallback: typeof data.displayName === "string" ? data.displayName : doc.id,
        }),
        strategy,
        guessMode: botGuessMode({ id: doc.id, strategy }),
        guessingEnabled: botGuessingEnabled({ id: doc.id, strategy }),
      };
    });
    const bots = configuredBots.length
      ? configuredBots.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      : DEFAULT_BOTS;

    const requestedBotId = request.nextUrl.searchParams.get("botId");
    const selectedBot = bots.find((bot) => bot.id === requestedBotId) ?? bots[0];
    if (!selectedBot) {
      return NextResponse.json({ bots: [], selectedBotId: null, rows: [], carismaRounds: [], serverTime: new Date().toISOString() });
    }

    const [matchesSnap, guessesSnap, teamsSnap, carismaSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("guesses").where("participantId", "==", selectedBot.id).get(),
      adminDb.collection("teams").get(),
      adminDb.collection("carismaSelections").where("participantId", "==", selectedBot.id).get(),
    ]);

    const guessByMatch = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }>();
    for (const doc of guessesSnap.docs) {
      const data = doc.data();
      if (data.source === "HUMAN") continue;
      if (Number(data.slot ?? 1) !== 1) continue;
      guessByMatch.set(String(data.matchId), { id: doc.id, data });
    }

    const now = Date.now();
    const rows = matchesSnap.docs.map((doc) => {
      const data = doc.data();
      const guess = guessByMatch.get(doc.id);
      const kickoffAt = data.kickoffAt?.toDate?.() as Date | undefined;
      const hasStarted = Boolean(kickoffAt && now >= kickoffAt.getTime()) || data.status !== "SCHEDULED";
      // O administrador pode criar ou corrigir palpites de bots mesmo depois do início.
      // Só bloqueamos partidas sem seleções definidas ou formalmente anuladas.
      const locked = data.teamsResolved === false || data.status === "VOID";
      return {
        matchId: doc.id,
        guessId: guess?.id ?? null,
        matchNumber: data.matchNumber ?? 0,
        phase: data.phase ?? "",
        group: data.group ?? null,
        groupRound: data.groupRound ?? null,
        homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "A definir",
        awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "A definir",
        homeTeamIso2: data.homeTeamIso2 ?? null,
        awayTeamIso2: data.awayTeamIso2 ?? null,
        venue: data.venue ?? null,
        kickoffAt: kickoffAt?.toISOString() ?? null,
        matchStatus: data.status ?? "SCHEDULED",
        teamsResolved: data.teamsResolved !== false,
        hasStarted,
        locked,
        botGuessingEnabled: selectedBot.guessingEnabled,
        botGuessMode: selectedBot.guessMode,
        prediction: guess ? { home: Number(guess.data.homeScore), away: Number(guess.data.awayScore) } : null,
        source: guess?.data.source ?? null,
        overrideReason: guess?.data.overrideReason ?? null,
        revision: guess?.data.revision ?? 0,
      };
    });

    const carismaRounds = buildBotCarismaRounds({
      botId: selectedBot.id,
      matchDocs: matchesSnap.docs,
      teamDocs: teamsSnap.docs,
      selectionDocs: carismaSnap.docs,
      now,
    });

    return NextResponse.json({
      bots,
      selectedBotId: selectedBot.id,
      selectedBotGuessingEnabled: selectedBot.guessingEnabled,
      selectedBotGuessMode: selectedBot.guessMode,
      rows,
      carismaRounds,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-bot-guesses", error);
    return NextResponse.json({ error: "Não foi possível carregar os palpites dos bots." }, { status: 500 });
  }
}
