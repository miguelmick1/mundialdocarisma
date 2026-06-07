import { config } from "dotenv";
config({ path: ".env.local" });
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

function db() {
  const projectId=process.env.FIREBASE_PROJECT_ID!;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey=process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g,"\n");
  if(!getApps().length) initializeApp({credential:cert({projectId,clientEmail,privateKey})});
  return getFirestore();
}

type Row={matchNumber:string;kickoffIso:string;phase:string;group?:string;homeTeamId:string;homeTeamName:string;awayTeamId:string;awayTeamName:string;venue?:string;sourceUrl?:string};

async function main(){
  const file=resolve(process.cwd(),process.argv[2] ?? "data/fifa-2026-matches.csv");
  const raw=await readFile(file,"utf8");
  const rows=parse(raw,{columns:true,skip_empty_lines:true,trim:true}) as Row[];
  const store=db(); const batch=store.batch();
  for(const row of rows){
    const matchNumber=Number(row.matchNumber); if(!Number.isInteger(matchNumber)) throw new Error(`Número inválido: ${row.matchNumber}`);
    const kickoff=new Date(row.kickoffIso); if(Number.isNaN(kickoff.getTime())) throw new Error(`Data inválida no jogo ${matchNumber}`);
    const ref=store.collection("matches").doc(`fifa-2026-${String(matchNumber).padStart(3,"0")}`);
    batch.set(ref,{matchNumber,kickoffAt:Timestamp.fromDate(kickoff),phase:row.phase,group:row.group||null,homeTeamId:row.homeTeamId,homeTeamName:row.homeTeamName,awayTeamId:row.awayTeamId,awayTeamName:row.awayTeamName,venue:row.venue||null,status:"SCHEDULED",scoringStatus:"PENDING",sourceUrl:row.sourceUrl||null,updatedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()},{merge:true});
  }
  await batch.commit(); console.log(`Importados/atualizados ${rows.length} jogos.`);
}
main().catch(err=>{console.error(err);process.exit(1);});
