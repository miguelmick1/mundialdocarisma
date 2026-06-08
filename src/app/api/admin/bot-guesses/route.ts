import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BOTS = [
  { id: "bot-oddmestre", name: "OddMestre", strategy: "ODD_MASTER" },
  { id: "bot-maria", name: "Maria Vai Com as Outras", strategy: "HUMAN_AVERAGE" },
  { id: "bot-faria", name: "Faria Limmer", strategy: "FARIA_LIMMER" },
  { id: "bot-pangare", name: "Pangaré", strategy: "PANGARE" }
];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const participantsSnap = await adminDb.collection("participants").where("type", "==", "BOT").get();
    const configuredBots = participantsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: typeof data.displayName === "string" ? data.displayName : doc.id,
        strategy: typeof data.botStrategy === "string" ? data.botStrategy : "UNKNOWN"
      };
    });
    const bots = configuredBots.length ? configuredBots.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : DEFAULT_BOTS;

    const requestedBotId = request.nextUrl.searchParams.get("botId");
    const selectedBot = bots.find((bot) => bot.id === requestedBotId) ?? bots[0];
    if (!selectedBot) return NextResponse.json({ bots: [], selectedBotId: null, rows: [], serverTime: new Date().toISOString() });

    const [matchesSnap, guessesSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(150).get(),
      adminDb.collection("guesses").where("participantId", "==", selectedBot.id).get()
    ]);

    const guessByMatch = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }>();
    for (const doc of guessesSnap.docs) {
      const data = doc.data();
      if (data.source === "HUMAN") continue;
      if (data.slot !== 1) continue;
      guessByMatch.set(data.matchId, { id: doc.id, data });
    }

    const now = Date.now();
    const rows = matchesSnap.docs.map((doc) => {
      const data = doc.data();
      const guess = guessByMatch.get(doc.id);
      const kickoffAt = data.kickoffAt?.toDate?.() as Date | undefined;
      const locked = !kickoffAt || now >= kickoffAt.getTime() || data.status !== "SCHEDULED" || data.teamsResolved === false;
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
        locked,
        prediction: guess ? { home: guess.data.homeScore, away: guess.data.awayScore } : null,
        source: guess?.data.source ?? null,
        overrideReason: guess?.data.overrideReason ?? null,
        revision: guess?.data.revision ?? 0
      };
    });

    return NextResponse.json({ bots, selectedBotId: selectedBot.id, rows, serverTime: new Date().toISOString() });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-bot-guesses", error);
    return NextResponse.json({ error: "Não foi possível carregar os palpites dos bots." }, { status: 500 });
  }
}
