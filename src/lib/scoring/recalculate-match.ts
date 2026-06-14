import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { calculateMatchScores } from "@/lib/scoring/match";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";
import { carismaRoundIdForMatch, isGroupRound } from "@/lib/world-cup/rounds";

function validScore(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export async function recalculateConfirmedMatchScores(
  matchId: string,
  supersededReason: string,
): Promise<boolean> {
  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) throw new Error("MATCH_NOT_FOUND");
  const match = matchSnap.data()!;
  if (match.status !== "FINISHED" && match.scoringStatus !== "CALCULATED") return false;

  const homeScore90 = validScore(match.homeScore90);
  const awayScore90 = validScore(match.awayScore90);
  const homeScore120 = validScore(match.homeScore120);
  const awayScore120 = validScore(match.awayScore120);
  const actual = {
    home: homeScore120 ?? homeScore90,
    away: awayScore120 ?? awayScore90,
  };
  if (actual.home === null || actual.away === null) throw new Error("MATCH_SCORE_MISSING");

  const [guessesSnap, existingEventsSnap] = await Promise.all([
    adminDb.collection("guesses").where("matchId", "==", matchId).get(),
    adminDb.collection("scoreEvents").where("matchId", "==", matchId).get(),
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

  const normalizedGuesses = guessesSnap.docs.flatMap((doc) => {
    const guess = doc.data();
    const participantId = typeof guess.participantId === "string" ? guess.participantId.trim() : "";
    const home = validScore(guess.homeScore);
    const away = validScore(guess.awayScore);
    const slot = Number(guess.slot ?? 1);
    if (!participantId || home === null || away === null || !Number.isInteger(slot)) return [];
    return [{
      doc,
      participantId,
      participantName: typeof guess.participantName === "string" && guess.participantName.trim()
        ? guess.participantName.trim()
        : participantId,
      slot,
      source: String(guess.source ?? (participantId.startsWith("bot-") ? "BOT_AUTOMATIC" : "HUMAN")),
      guess: { home, away },
    }];
  });

  const scored = calculateMatchScores({
    actual: { home: actual.home, away: actual.away },
    homeTeamId: String(match.homeTeamId ?? ""),
    awayTeamId: String(match.awayTeamId ?? ""),
    guesses: normalizedGuesses.map((entry) => ({
      participantId: entry.participantId,
      slot: entry.slot,
      source: entry.source,
      guess: entry.guess,
      ...(carismaByParticipant.has(entry.participantId)
        ? { carismaTeamId: carismaByParticipant.get(entry.participantId)! }
        : {}),
    })),
  });
  const scoreByGuess = new Map(scored.map((entry) => [`${entry.participantId}:${entry.slot}`, entry]));
  const targetEventIds = new Set(
    normalizedGuesses.map((entry) => `${matchId}_${entry.participantId}_${entry.slot}_v2`),
  );

  const batch = adminDb.batch();
  existingEventsSnap.docs
    .filter((doc) => doc.data().active === true && !targetEventIds.has(doc.id))
    .forEach((doc) => batch.update(doc.ref, {
      active: false,
      supersededAt: FieldValue.serverTimestamp(),
      supersededReason,
    }));

  for (const entry of normalizedGuesses) {
    const result = scoreByGuess.get(`${entry.participantId}:${entry.slot}`);
    if (!result) continue;
    batch.set(adminDb.collection("scoreEvents").doc(`${matchId}_${entry.participantId}_${entry.slot}_v2`), {
      matchId,
      participantId: entry.participantId,
      participantName: entry.participantName,
      guessId: entry.doc.id,
      slot: entry.slot,
      ruleSetVersion: 2,
      baseCode: result.baseCode,
      totalPoints: result.result.total,
      components: result.result.components,
      active: true,
      calculatedAt: FieldValue.serverTimestamp(),
      recalculatedAfterAdministrativeGuess: true,
    });
  }

  await batch.commit();
  await recalculateOverallRankings();
  return true;
}
