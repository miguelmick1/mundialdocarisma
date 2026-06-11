import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { calculateMatchScores } from "@/lib/scoring/match";
import { carismaRoundIdForMatch, isGroupRound } from "@/lib/world-cup/rounds";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalScore = z.number().int().min(0).max(30).nullable().optional();
const schema = z.object({
  matchId: z.string().min(1),
  action: z.enum(["UPDATE_LIVE", "SAVE_PROVISIONAL", "CONFIRM", "VOID"]),
  livePeriod: z.enum(["1H", "HT", "2H", "ET", "PEN"]).optional(),
  liveMinute: z.number().int().min(0).max(150).nullable().optional(),
  liveHomeScore: optionalScore,
  liveAwayScore: optionalScore,
  homeScore90: optionalScore,
  awayScore90: optionalScore,
  homeScore120: optionalScore,
  awayScore120: optionalScore,
  homePenalties: optionalScore,
  awayPenalties: optionalScore,
  voidReason: z.string().min(5).max(300).optional()
});

function statusForPeriod(period: string) {
  if (period === "HT") return "HALFTIME";
  if (period === "ET" || period === "PEN") return "EXTRA_TIME";
  return "LIVE";
}

function toNullable(value: number | null | undefined) {
  return value === undefined ? null : value;
}

export async function GET() {
  try {
    await requireAdmin();
    const snap = await adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get();
    const matches = snap.docs.map((doc) => {
      const data = doc.data();
      const kickoffAt = data.kickoffAt?.toDate?.() as Date | undefined;
      const liveUpdatedAt = data.liveUpdatedAt?.toDate?.() as Date | undefined;
      const resultConfirmedAt = data.resultConfirmedAt?.toDate?.() as Date | undefined;
      return {
        id: doc.id,
        matchNumber: Number(data.matchNumber ?? 0),
        phase: String(data.phase ?? ""),
        group: data.group ?? null,
        groupRound: data.groupRound ?? null,
        homeTeamId: data.homeTeamId ?? "",
        awayTeamId: data.awayTeamId ?? "",
        homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "Mandante",
        awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "Visitante",
        homeTeamIso2: data.homeTeamIso2 ?? null,
        awayTeamIso2: data.awayTeamIso2 ?? null,
        teamsResolved: data.teamsResolved !== false,
        kickoffAt: kickoffAt?.toISOString() ?? null,
        venue: data.venue ?? null,
        status: data.status ?? "SCHEDULED",
        scoringStatus: data.scoringStatus ?? "PENDING",
        livePeriod: data.livePeriod ?? null,
        liveMinute: data.liveMinute ?? null,
        liveHomeScore: data.liveHomeScore ?? null,
        liveAwayScore: data.liveAwayScore ?? null,
        homeScore90: data.homeScore90 ?? null,
        awayScore90: data.awayScore90 ?? null,
        homeScore120: data.homeScore120 ?? null,
        awayScore120: data.awayScore120 ?? null,
        homePenalties: data.homePenalties ?? null,
        awayPenalties: data.awayPenalties ?? null,
        resultSource: data.resultSource ?? null,
        liveUpdatedAt: liveUpdatedAt?.toISOString() ?? null,
        resultConfirmedAt: resultConfirmedAt?.toISOString() ?? null,
        voidReason: data.voidReason ?? null
      };
    });
    return NextResponse.json({ matches, serverTime: new Date().toISOString() });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-results-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os jogos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const matchRef = adminDb.collection("matches").doc(input.matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    const match = matchSnap.data()!;

    if (input.action !== "VOID" && (match.status === "FINISHED" || match.scoringStatus === "CALCULATED")) {
      return NextResponse.json({ error: "O resultado já foi confirmado. Para corrigir, anule a partida conforme o regulamento." }, { status: 409 });
    }
    if (match.status === "VOID" && input.action !== "VOID") {
      return NextResponse.json({ error: "A partida está anulada." }, { status: 409 });
    }

    if (input.action === "UPDATE_LIVE") {
      if (!input.livePeriod || input.liveHomeScore == null || input.liveAwayScore == null) {
        return NextResponse.json({ error: "Informe período e placar ao vivo." }, { status: 400 });
      }
      const status = statusForPeriod(input.livePeriod);
      await adminDb.runTransaction(async (tx) => {
        tx.update(matchRef, {
          status,
          livePeriod: input.livePeriod,
          liveMinute: toNullable(input.liveMinute),
          liveHomeScore: input.liveHomeScore,
          liveAwayScore: input.liveAwayScore,
          resultSource: "MANUAL",
          liveUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        tx.set(adminDb.collection("auditLogs").doc(), {
          type: "MATCH_LIVE_SCORE_UPDATED",
          actorUid: actor.uid,
          matchId: input.matchId,
          period: input.livePeriod,
          minute: input.liveMinute ?? null,
          score: { home: input.liveHomeScore, away: input.liveAwayScore },
          createdAt: FieldValue.serverTimestamp()
        });
      });
      return NextResponse.json({ ok: true, status });
    }

    if (input.action === "SAVE_PROVISIONAL") {
      if (input.homeScore90 == null || input.awayScore90 == null) {
        return NextResponse.json({ error: "Informe o placar ao final de 90 minutos." }, { status: 400 });
      }
      const finalHome = input.homeScore120 ?? input.homeScore90;
      const finalAway = input.awayScore120 ?? input.awayScore90;
      await adminDb.runTransaction(async (tx) => {
        tx.update(matchRef, {
          status: "FINISHED_PROVISIONAL",
          scoringStatus: "PENDING",
          homeScore90: input.homeScore90,
          awayScore90: input.awayScore90,
          homeScore120: toNullable(input.homeScore120),
          awayScore120: toNullable(input.awayScore120),
          homePenalties: toNullable(input.homePenalties),
          awayPenalties: toNullable(input.awayPenalties),
          liveHomeScore: finalHome,
          liveAwayScore: finalAway,
          livePeriod: null,
          liveMinute: null,
          resultSource: "MANUAL",
          liveUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        tx.set(adminDb.collection("auditLogs").doc(), {
          type: "MATCH_RESULT_SAVED_PROVISIONAL",
          actorUid: actor.uid,
          matchId: input.matchId,
          score90: { home: input.homeScore90, away: input.awayScore90 },
          score120: input.homeScore120 == null ? null : { home: input.homeScore120, away: input.awayScore120 },
          penalties: input.homePenalties == null ? null : { home: input.homePenalties, away: input.awayPenalties },
          createdAt: FieldValue.serverTimestamp()
        });
      });
      return NextResponse.json({ ok: true, status: "FINISHED_PROVISIONAL" });
    }

    if (input.action === "VOID") {
      const oldEvents = await adminDb.collection("scoreEvents").where("matchId", "==", input.matchId).get();
      const batch = adminDb.batch();
      oldEvents.docs.filter((doc) => doc.data().active === true).forEach((doc) => batch.update(doc.ref, {
        active: false,
        supersededAt: FieldValue.serverTimestamp(),
        supersededReason: "MATCH_VOIDED"
      }));
      batch.update(matchRef, {
        status: "VOID",
        scoringStatus: "VOID",
        voidReason: input.voidReason ?? "ADMINISTRATIVE_VOID",
        updatedAt: FieldValue.serverTimestamp()
      });
      batch.set(adminDb.collection("auditLogs").doc(), {
        type: "MATCH_VOIDED",
        actorUid: actor.uid,
        matchId: input.matchId,
        reason: input.voidReason ?? null,
        createdAt: FieldValue.serverTimestamp()
      });
      await batch.commit();
      await recalculateOverallRankings();
      return NextResponse.json({ ok: true, status: "VOID" });
    }

    const homeScore90 = input.homeScore90 ?? match.homeScore90;
    const awayScore90 = input.awayScore90 ?? match.awayScore90;
    const homeScore120 = input.homeScore120 ?? match.homeScore120 ?? null;
    const awayScore120 = input.awayScore120 ?? match.awayScore120 ?? null;
    const homePenalties = input.homePenalties ?? match.homePenalties ?? null;
    const awayPenalties = input.awayPenalties ?? match.awayPenalties ?? null;
    if (homeScore90 == null || awayScore90 == null) {
      return NextResponse.json({ error: "Salve ou informe o placar de 90 minutos antes de confirmar." }, { status: 400 });
    }

    const actual = {
      home: homeScore120 ?? homeScore90,
      away: awayScore120 ?? awayScore90
    };
    const [guesses, existingEvents] = await Promise.all([
      adminDb.collection("guesses").where("matchId", "==", input.matchId).get(),
      adminDb.collection("scoreEvents").where("matchId", "==", input.matchId).get()
    ]);
    const roundId = match.competitionRoundId ?? carismaRoundIdForMatch(match.phase, match.groupRound);
    const carismaByParticipant = new Map<string, string>();
    if (roundId) {
      const selections = isGroupRound(roundId)
        ? await adminDb.collection("carismaSelections").where("roundId", "in", ["GROUP_1", "GROUP_2", "GROUP_3"]).get()
        : await adminDb.collection("carismaSelections").where("roundId", "==", roundId).get();
      const selectionIndex = buildCarismaSelectionIndex(selections.docs.map((doc) => doc.data()));
      for (const [key, selection] of selectionIndex.byRoundParticipant) {
        if (key.startsWith(`${roundId}:`)) carismaByParticipant.set(selection.participantId, selection.teamId);
      }
    }

    const batch = adminDb.batch();
    existingEvents.docs.filter((doc) => doc.data().active === true).forEach((doc) => batch.update(doc.ref, {
      active: false,
      supersededAt: FieldValue.serverTimestamp(),
      supersededReason: "RESULT_RECALCULATED"
    }));

    batch.update(matchRef, {
      status: "FINISHED",
      scoringStatus: "CALCULATED",
      homeScore90,
      awayScore90,
      homeScore120,
      awayScore120,
      homePenalties,
      awayPenalties,
      liveHomeScore: actual.home,
      liveAwayScore: actual.away,
      livePeriod: null,
      liveMinute: null,
      resultSource: match.resultSource ?? "MANUAL",
      resultConfirmedAt: FieldValue.serverTimestamp(),
      resultConfirmedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    });

    const scoredGuesses = calculateMatchScores({
      actual,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      guesses: guesses.docs.map((guessDoc) => {
        const guess = guessDoc.data();
        return {
          participantId: String(guess.participantId),
          slot: Number(guess.slot ?? 1),
          source: String(guess.source ?? "HUMAN"),
          guess: { home: Number(guess.homeScore), away: Number(guess.awayScore) },
          carismaTeamId: carismaByParticipant.get(String(guess.participantId))
        };
      })
    });
    const scoreByGuess = new Map(
      scoredGuesses.map((entry) => [`${entry.participantId}:${entry.slot}`, entry])
    );

    guesses.docs.forEach((guessDoc) => {
      const guess = guessDoc.data();
      const scored = scoreByGuess.get(`${guess.participantId}:${Number(guess.slot ?? 1)}`);
      if (!scored) return;
      batch.set(adminDb.collection("scoreEvents").doc(`${input.matchId}_${guess.participantId}_${guess.slot}_v2`), {
        matchId: input.matchId,
        participantId: guess.participantId,
        participantName: guess.participantName,
        guessId: guessDoc.id,
        slot: guess.slot,
        ruleSetVersion: 2,
        baseCode: scored.baseCode,
        totalPoints: scored.result.total,
        components: scored.result.components,
        active: true,
        calculatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });

    batch.set(adminDb.collection("auditLogs").doc(), {
      type: "MATCH_RESULT_CONFIRMED",
      actorUid: actor.uid,
      matchId: input.matchId,
      actual,
      score90: { home: homeScore90, away: awayScore90 },
      score120: homeScore120 == null ? null : { home: homeScore120, away: awayScore120 },
      penalties: homePenalties == null ? null : { home: homePenalties, away: awayPenalties },
      createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    await recalculateOverallRankings();
    return NextResponse.json({ ok: true, status: "FINISHED", actual });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-match-result", error);
    return NextResponse.json({ error: "Não foi possível processar o resultado." }, { status: 400 });
  }
}
