import { config } from "dotenv";
config({ path: ".env.local" });
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { generateMariaGuess } from "../src/lib/bots/maria";
import { generatePangareGuess } from "../src/lib/bots/pangare";

const projectId = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const bots = [
  { id: "bot-oddmestre", name: "Betinho Everyday", strategy: "ODD_MASTER", guessMode: "MANUAL", guessingEnabled: true },
  { id: "bot-maria", name: "Maria Vai com as Outras", strategy: "HUMAN_AVERAGE", guessMode: "AUTOMATIC", guessingEnabled: true },
  { id: "bot-faria", name: "Transbot", strategy: "FARIA_LIMMER", guessMode: "MANUAL", guessingEnabled: true },
  { id: "bot-pangare", name: "Pangaré", strategy: "PANGARE", guessMode: "AUTOMATIC", guessingEnabled: true },
];

async function saveBotGuess(matchId: string, bot: { id: string; name: string }, generated: any) {
  const guessId = `${matchId}_${bot.id}_1`;
  await db.collection("guesses").doc(guessId).set({
    matchId,
    participantId: bot.id,
    participantName: bot.name,
    slot: 1,
    homeScore: generated.prediction.home,
    awayScore: generated.prediction.away,
    source: "BOT_AUTOMATIC",
    revision: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("botGuessSources").doc(guessId).set({
    guessId,
    matchId,
    botId: bot.id,
    botName: bot.name,
    calculatedAt: FieldValue.serverTimestamp(),
    ...generated.source,
  });
}

async function main() {
  for (const bot of bots) {
    await db.collection("participants").doc(bot.id).set({
      type: "BOT",
      displayName: bot.name,
      botStrategy: bot.strategy,
      guessMode: bot.guessMode,
      guessingEnabled: bot.guessingEnabled,
      status: "ACTIVE",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const demoId = "demo-transparencia";
  await db.collection("matches").doc(demoId).set({
    matchNumber: 0,
    phase: "DEMO",
    homeTeamId: "BRA",
    homeTeamName: "Brasil",
    awayTeamId: "FRA",
    awayTeamName: "França",
    venue: "Demonstração",
    kickoffAt: Timestamp.fromDate(new Date("2026-05-30T18:00:00.000Z")),
    status: "FINISHED",
    scoringStatus: "PENDING",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const maria = generateMariaGuess([
    { home: 2, away: 1 }, { home: 1, away: 1 }, { home: 3, away: 1 },
    { home: 2, away: 0 }, { home: 1, away: 2 }, { home: 2, away: 1 },
  ]);
  const pangare = generatePangareGuess({
    matchId: demoId,
    secret: process.env.APP_SECRET!,
    favoriteSide: "AWAY",
    favoriteBasis: {
      method: "DEMO",
      explanation: "Favorito definido apenas para a demonstração do seed.",
      homePot: 2,
      awayPot: 1,
    },
  });

  // Maria e Pangaré têm demonstração automática. Betinho e Transbot serão preenchidos manualmente pelo administrador nos jogos reais.
  await saveBotGuess(demoId, bots[1]!, maria);
  await saveBotGuess(demoId, bots[3]!, pangare);

  for (let i = 0; i < bots.length; i += 1) {
    await db.collection("rankings").doc(`overall_${bots[i]!.id}`).set({
      competitionId: "overall",
      participantId: bots[i]!.id,
      displayName: bots[i]!.name,
      totalPoints: bots[i]!.guessMode === "AUTOMATIC" ? 18 - i * 2 : 0,
      exactHits: bots[i]!.guessMode === "AUTOMATIC" ? 3 - (i % 2) : 0,
      previousPosition: i + 2,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log("Seed concluído. Maria e Pangaré possuem demonstração automática; Betinho e Transbot usam preenchimento manual pelo administrador.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
