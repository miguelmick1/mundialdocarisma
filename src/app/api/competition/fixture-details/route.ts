import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ fixtureId: z.string().trim().min(1).max(500) });

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const { fixtureId } = schema.parse({ fixtureId: request.nextUrl.searchParams.get("fixtureId") });
    const fixtureSnap = await adminDb.collection("participantGroupFixtures").doc(fixtureId).get();
    if (!fixtureSnap.exists) return NextResponse.json({ error: "Confronto não encontrado." }, { status: 404 });
    const fixture = fixtureSnap.data()!;
    const participantIds = [String(fixture.homeParticipantId), String(fixture.awayParticipantId)];
    const round = Number(fixture.round);

    const [assignments, matchesSnap, guessesSnap, eventsSnap] = await Promise.all([
      adminDb.getAll(...participantIds.map((id) => adminDb.collection("participantGroupAssignments").doc(id))),
      adminDb.collection("matches").where("phase", "==", "GROUP_STAGE").get(),
      adminDb.collection("guesses").where("participantId", "in", participantIds).get(),
      adminDb.collection("scoreEvents").where("active", "==", true).where("participantId", "in", participantIds).get(),
    ]);
    const names = new Map(assignments.map((doc) => [doc.id, doc.data()?.displayName ?? doc.id]));
    const guessesByKey = new Map<string, Array<{ slot: number; homeScore: number; awayScore: number }>>();
    guessesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const key = `${data.matchId}:${data.participantId}`;
      const rows = guessesByKey.get(key) ?? [];
      rows.push({ slot: Number(data.slot ?? 1), homeScore: Number(data.homeScore), awayScore: Number(data.awayScore) });
      guessesByKey.set(key, rows.sort((a, b) => a.slot - b.slot));
    });
    const pointsByKey = new Map<string, number>();
    eventsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const key = `${data.matchId}:${data.participantId}`;
      pointsByKey.set(key, Math.max(pointsByKey.get(key) ?? 0, Number(data.totalPoints ?? 0)));
    });

    const now = Date.now();
    const games = matchesSnap.docs.filter((doc) => Number(doc.data().groupRound) === round).map((doc) => {
      const data = doc.data();
      const kickoff = data.kickoffAt?.toDate?.() as Date | undefined;
      const revealed = Boolean(kickoff && now >= kickoff.getTime()) || data.status !== "SCHEDULED";
      const resultCalculated = data.status === "FINISHED" || data.scoringStatus === "CALCULATED";
      const homeScore = data.homeScore120 ?? data.homeScore90 ?? data.liveHomeScore ?? null;
      const awayScore = data.awayScore120 ?? data.awayScore90 ?? data.liveAwayScore ?? null;
      return {
        matchId: doc.id,
        matchNumber: Number(data.matchNumber ?? 0),
        homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "Mandante",
        awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "Visitante",
        status: data.status ?? "SCHEDULED",
        result: homeScore != null && awayScore != null ? { home: Number(homeScore), away: Number(awayScore) } : null,
        resultCalculated,
        participants: participantIds.map((participantId) => ({
          participantId,
          displayName: names.get(participantId) ?? participantId,
          guesses: revealed ? guessesByKey.get(`${doc.id}:${participantId}`) ?? [] : [],
          points: resultCalculated ? pointsByKey.get(`${doc.id}:${participantId}`) ?? 0 : null,
        })),
      };
    }).sort((a, b) => a.matchNumber - b.matchNumber);
    if (!games.some((game) => game.status !== "SCHEDULED")) {
      return NextResponse.json({ error: "Este confronto ainda não começou." }, { status: 409 });
    }

    return NextResponse.json({
      fixtureId,
      round,
      home: { id: participantIds[0], displayName: names.get(participantIds[0]) ?? participantIds[0] },
      away: { id: participantIds[1], displayName: names.get(participantIds[1]) ?? participantIds[1] },
      games,
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Confronto inválido." }, { status: 400 });
    console.error("fixture-details", error);
    return NextResponse.json({ error: "Não foi possível carregar o confronto." }, { status: 500 });
  }
}
