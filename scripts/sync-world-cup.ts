import { config } from "dotenv";
config({ path: ".env.local" });

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { syncWorldCupSchedule } from "../src/lib/world-cup/schedule";

function database() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Preencha FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env.local.");
  }
  if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

async function main() {
  console.log("Consultando o calendário público da Copa do Mundo 2026...");
  const result = await syncWorldCupSchedule(database());
  console.log(`Sincronização concluída: ${result.matches} partidas e ${result.teams} seleções.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
