import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { calculateMatchScores } from "@/lib/scoring/match";
import { carismaRoundIdForMatch, isGroupRound } from "@/lib/world-cup/rounds";
import { isAdvancingPhase, isUnresolvedTeamId, resolveQualifiedTeamId } from "@/lib/world-cup/advancement";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";
import { processAutomaticBotGuesses } from "@/lib/bots/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalScore = z.number().int().min(0).max(30).nullable().optional();
const schema = z.object({
  matchId: z.string().min(1),
  action: z.enum(["UPDATE_LIVE", "SAVE_PROVISIONAL", "CONFIRM", "VOID", "EXCLUDE_FROM_SCORING"]),
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
  qualifiedTeamId: z.string().trim().min(1).max(30).optional(),
  voidReason: z.string().min(5).max(300).optional()
});

type AdvancementPlan = {
  targetMatchId: string;
  targetMatchNumber: number;
  targetSide: "home" | "away";
  qualifiedTeamId: string;
  qualifiedTeamName: string;
  qualifiedTeamIso2: string | null;
  update: Record<string, unknown>;
};

function teamInfoFromMatch(match: FirebaseFirestore.DocumentData, teamId: string) {
  if (teamId === String(match.homeTeamId ?? "")) {
    return {
      id: teamId,
      name: String(match.homeTeamName ?? teamId),
      iso2: typeof match.homeTeamIso2 === "string" ? match.homeTeamIso2 : null
    };
  }
  if (teamId === String(match.awayTeamId ?? "")) {
    return {
      id: teamId,
      name: String(match.awayTeamName ?? teamId),
      iso2: typeof match.awayTeamIso2 === "string" ? match.awayTeamIso2 : null
    };
  }
  return null;
}

async function buildAdvancementPlan(
  matchId: string,
  match: FirebaseFirestore.DocumentData,
  actual: { home: number; away: number },
  requestedTeamId?: string
): Promise<AdvancementPlan | null> {
  if (!isAdvancingPhase(match.phase)) return null;
  const matchNumber = Number(match.matchNumber ?? 0);
  if (!Number.isInteger(matchNumber) || matchNumber <= 0) throw new Error("MATCH_NUMBER_MISSING");

  const qualifiedTeamId = resolveQualifiedTeamId(match, actual, requestedTeamId);
  const qualifiedTeam = teamInfoFromMatch(match, qualifiedTeamId);
  if (!qualifiedTeam) throw new Error("INVALID_QUALIFIED_TEAM");

  const winnerSlot = `W${matchNumber}`;
  const [homeTargetSnap, awayTargetSnap] = await Promise.all([
    adminDb.collection("matches").where("homeTeamId", "==", winnerSlot).limit(1).get(),
    adminDb.collection("matches").where("awayTeamId", "==", winnerSlot).limit(1).get()
  ]);
  const homeTarget = homeTargetSnap.docs[0];
  const awayTarget = awayTargetSnap.docs[0];
  const targetDoc = homeTarget ?? awayTarget;
  if (!targetDoc) throw new Error("ADVANCEMENT_TARGET_NOT_FOUND");

  const targetSide: "home" | "away" = homeTarget ? "home" : "away";
  const targetData = targetDoc.data();
  const currentTeamId = String(targetData[`${targetSide}TeamId`] ?? "");
  if (currentTeamId !== winnerSlot && currentTeamId !== qualifiedTeam.id) {
    throw new Error("ADVANCEMENT_TARGET_CONFLICT");
  }

  const nextHomeTeamId = targetSide === "home" ? qualifiedTeam.id : String(targetData.homeTeamId ?? "");
  const nextAwayTeamId = targetSide === "away" ? qualifiedTeam.id : String(targetData.awayTeamId ?? "");
  return {
    targetMatchId: targetDoc.id,
    targetMatchNumber: Number(targetData.matchNumber ?? 0),
    targetSide,
    qualifiedTeamId: qualifiedTeam.id,
    qualifiedTeamName: qualifiedTeam.name,
    qualifiedTeamIso2: qualifiedTeam.iso2,
    update: {
      [`${targetSide}TeamId`]: qualifiedTeam.id,
      [`${targetSide}TeamName`]: qualifiedTeam.name,
      [`${targetSide}TeamIso2`]: qualifiedTeam.iso2,
      teamsResolved: !isUnresolvedTeamId(nextHomeTeamId) && !isUnresolvedTeamId(nextAwayTeamId),
      updatedAt: FieldValue.serverTimestamp(),
      resolvedFromMatchId: matchId
    }
  };
}

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
        qualifiedTeamId: data.qualifiedTeamId ?? null,
        qualifiedTeamName: data.qualifiedTeamName ?? null,
        qualifiedTeamIso2: data.qualifiedTeamIso2 ?? null,
        advancementTargetMatchId: data.advancementTargetMatchId ?? null,
        advancementTargetMatchNumber: data.advancementTargetMatchNumber ?? null,
        advancementTargetSide: data.advancementTargetSide ?? null,
        excludedFromScoring: Boolean(data.excludedFromScoring),
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

    if (!["VOID", "EXCLUDE_FROM_SCORING"].includes(input.action) && (match.status === "FINISHED" || match.scoringStatus === "CALCULATED")) {
      return NextResponse.json({ error: "O resultado já foi confirmado. Para corrigir, anule a partida conforme o regulamento." }, { status: 409 });
    }
    if (match.status === "VOID" && !["VOID", "EXCLUDE_FROM_SCORING"].includes(input.action)) {
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

    if (input.action === "VOID" || input.action === "EXCLUDE_FROM_SCORING") {
      const excludedFromScoring = input.action === "EXCLUDE_FROM_SCORING";
      const oldEvents = await adminDb.collection("scoreEvents").where("matchId", "==", input.matchId).get();
      const batch = adminDb.batch();
      oldEvents.docs.filter((doc) => doc.data().active === true).forEach((doc) => batch.update(doc.ref, {
        active: false,
        supersededAt: FieldValue.serverTimestamp(),
        supersededReason: excludedFromScoring ? "MATCH_EXCLUDED_FROM_SCORING" : "MATCH_VOIDED"
      }));
      batch.update(matchRef, {
        status: "VOID",
        scoringStatus: "VOID",
        voidReason: input.voidReason ?? (excludedFromScoring ? "SCORING_EXCLUDED_BY_ADMIN" : "ADMINISTRATIVE_VOID"),
        excludedFromScoring,
        updatedAt: FieldValue.serverTimestamp()
      });
      batch.set(adminDb.collection("auditLogs").doc(), {
        type: excludedFromScoring ? "MATCH_EXCLUDED_FROM_SCORING" : "MATCH_VOIDED",
        actorUid: actor.uid,
        matchId: input.matchId,
        reason: input.voidReason ?? null,
        createdAt: FieldValue.serverTimestamp()
      });
      await batch.commit();
      await recalculateOverallRankings();
      return NextResponse.json({ ok: true, status: "VOID", excludedFromScoring });
    }

    // A tela simplificada envia um único placar final. Mantemos compatibilidade
    // com registros antigos que possuam placares separados de 90 e 120 minutos.
    const submittedHome = input.homeScore90 ?? input.liveHomeScore;
    const submittedAway = input.awayScore90 ?? input.liveAwayScore;
    const homeScore90 = submittedHome ?? match.homeScore90 ?? match.liveHomeScore;
    const awayScore90 = submittedAway ?? match.awayScore90 ?? match.liveAwayScore;
    const homeScore120 = input.homeScore120 ?? null;
    const awayScore120 = input.awayScore120 ?? null;
    const homePenalties = input.homePenalties ?? null;
    const awayPenalties = input.awayPenalties ?? null;
    if (homeScore90 == null || awayScore90 == null) {
      return NextResponse.json({ error: "Informe o placar final das duas seleções." }, { status: 400 });
    }

    const actual = {
      home: homeScore120 ?? homeScore90,
      away: awayScore120 ?? awayScore90
    };

    let advancement: AdvancementPlan | null = null;
    try {
      advancement = await buildAdvancementPlan(input.matchId, match, actual, input.qualifiedTeamId);
    } catch (advancementError) {
      const code = (advancementError as Error).message;
      const messages: Record<string, string> = {
        QUALIFIED_TEAM_REQUIRED: "O placar ficou empatado. Indique qual seleção se classificou.",
        INVALID_QUALIFIED_TEAM: "A seleção classificada precisa ser uma das duas seleções da partida.",
        MATCH_NUMBER_MISSING: "A partida não possui número oficial para avanço no chaveamento.",
        ADVANCEMENT_TARGET_NOT_FOUND: "Não encontrei o jogo seguinte com o slot do vencedor. Sincronize as partidas do mata-mata antes de confirmar.",
        ADVANCEMENT_TARGET_CONFLICT: "O jogo seguinte já possui outra seleção nesse slot. Confira o chaveamento antes de confirmar."
      };
      return NextResponse.json({ error: messages[code] ?? "Não foi possível validar o classificado." }, { status: 400 });
    }

    // A geração dos bots é importante, mas uma indisponibilidade pontual não pode
    // impedir o administrador de registrar o resultado oficial da partida.
    const automationWarnings: Array<{ matchId?: string; botId?: string; message: string }> = [];
    try {
      const botAutomation = await processAutomaticBotGuesses({ matchIds: [input.matchId], force: true });
      if (botAutomation.errors.length) {
        console.error("bot-automation-before-score", botAutomation.errors);
        automationWarnings.push(...botAutomation.errors);
      }
    } catch (automationError) {
      console.error("bot-automation-before-score", automationError);
      automationWarnings.push({
        matchId: input.matchId,
        botId: "bot-automation",
        message: automationError instanceof Error ? automationError.message : "Falha na automação dos bots"
      });
    }

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

    const normalizedGuesses = guesses.docs.flatMap((guessDoc) => {
      const guess = guessDoc.data();
      const participantId = String(guess.participantId ?? "").trim();
      const home = Number(guess.homeScore);
      const away = Number(guess.awayScore);
      if (!participantId || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
        console.warn("invalid-guess-skipped-during-scoring", { guessId: guessDoc.id, participantId });
        return [];
      }
      const storedName = typeof guess.participantName === "string" ? guess.participantName.trim() : "";
      return [{
        doc: guessDoc,
        participantId,
        participantName: storedName || participantId,
        slot: Number.isInteger(Number(guess.slot)) ? Number(guess.slot) : 1,
        source: String(guess.source ?? (participantId.startsWith("bot-") ? "BOT_AUTOMATIC" : "HUMAN")),
        guess: { home, away }
      }];
    });

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
      qualifiedTeamId: advancement?.qualifiedTeamId ?? null,
      qualifiedTeamName: advancement?.qualifiedTeamName ?? null,
      qualifiedTeamIso2: advancement?.qualifiedTeamIso2 ?? null,
      advancementTargetMatchId: advancement?.targetMatchId ?? null,
      advancementTargetMatchNumber: advancement?.targetMatchNumber ?? null,
      advancementTargetSide: advancement?.targetSide ?? null,
      advancementAppliedAt: advancement ? FieldValue.serverTimestamp() : null,
      resultConfirmedAt: FieldValue.serverTimestamp(),
      resultConfirmedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (advancement) {
      batch.update(adminDb.collection("matches").doc(advancement.targetMatchId), advancement.update);
    }

    const scoredGuesses = calculateMatchScores({
      actual,
      homeTeamId: String(match.homeTeamId ?? ""),
      awayTeamId: String(match.awayTeamId ?? ""),
      guesses: normalizedGuesses.map((entry) => ({
        participantId: entry.participantId,
        slot: entry.slot,
        source: entry.source,
        guess: entry.guess,
        ...(carismaByParticipant.has(entry.participantId)
          ? { carismaTeamId: carismaByParticipant.get(entry.participantId)! }
          : {})
      }))
    });
    const scoreByGuess = new Map(
      scoredGuesses.map((entry) => [`${entry.participantId}:${entry.slot}`, entry])
    );

    normalizedGuesses.forEach((entry) => {
      const scored = scoreByGuess.get(`${entry.participantId}:${entry.slot}`);
      if (!scored) return;
      batch.set(adminDb.collection("scoreEvents").doc(`${input.matchId}_${entry.participantId}_${entry.slot}_v2`), {
        matchId: input.matchId,
        participantId: entry.participantId,
        participantName: entry.participantName,
        guessId: entry.doc.id,
        slot: entry.slot,
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
      qualifiedTeamId: advancement?.qualifiedTeamId ?? null,
      advancement: advancement
        ? {
            targetMatchId: advancement.targetMatchId,
            targetMatchNumber: advancement.targetMatchNumber,
            targetSide: advancement.targetSide
          }
        : null,
      score90: { home: homeScore90, away: awayScore90 },
      score120: homeScore120 == null ? null : { home: homeScore120, away: awayScore120 },
      penalties: homePenalties == null ? null : { home: homePenalties, away: awayPenalties },
      createdAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
    await recalculateOverallRankings();
    return NextResponse.json({
      ok: true,
      status: "FINISHED",
      actual,
      advancement: advancement
        ? {
            qualifiedTeamId: advancement.qualifiedTeamId,
            qualifiedTeamName: advancement.qualifiedTeamName,
            targetMatchNumber: advancement.targetMatchNumber,
            targetSide: advancement.targetSide
          }
        : undefined,
      automationWarnings: automationWarnings.length ? automationWarnings : undefined
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-match-result", error);
    return NextResponse.json({ error: "Não foi possível processar o resultado. Verifique os dados e tente novamente." }, { status: 500 });
  }
}
