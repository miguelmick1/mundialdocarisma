import { config } from "dotenv";
config({ path: ".env.local" });
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { generateFariaLimmerGuess } from "../src/lib/bots/faria-limmer";
import { generateMariaGuess } from "../src/lib/bots/maria";
import { generateOddMestreGuess } from "../src/lib/bots/oddmestre";
import { generatePangareGuess } from "../src/lib/bots/pangare";

const projectId=process.env.FIREBASE_PROJECT_ID!; const clientEmail=process.env.FIREBASE_CLIENT_EMAIL!; const privateKey=process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g,"\n");
if(!getApps().length) initializeApp({credential:cert({projectId,clientEmail,privateKey})});
const db=getFirestore();

const bots=[
  {id:"bot-oddmestre",name:"OddMestre",strategy:"ODD_MASTER"},
  {id:"bot-maria",name:"Maria Vai Com as Outras",strategy:"HUMAN_AVERAGE"},
  {id:"bot-faria",name:"Faria Limmer",strategy:"FARIA_LIMMER"},
  {id:"bot-pangare",name:"Pangaré",strategy:"PANGARE"}
];

async function saveBotGuess(matchId:string,bot:{id:string;name:string},generated:any){
  const guessId=`${matchId}_${bot.id}_1`;
  await db.collection("guesses").doc(guessId).set({matchId,participantId:bot.id,participantName:bot.name,slot:1,homeScore:generated.prediction.home,awayScore:generated.prediction.away,source:"BOT_AUTOMATIC",revision:1,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  await db.collection("botGuessSources").doc(guessId).set({guessId,matchId,botId:bot.id,botName:bot.name,calculatedAt:FieldValue.serverTimestamp(),...generated.source});
}

async function main(){
  for(const bot of bots){await db.collection("participants").doc(bot.id).set({type:"BOT",displayName:bot.name,botStrategy:bot.strategy,status:"ACTIVE",createdAt:FieldValue.serverTimestamp()},{merge:true});}
  const demoId="demo-transparencia";
  await db.collection("matches").doc(demoId).set({matchNumber:0,phase:"DEMO",homeTeamId:"BRA",homeTeamName:"Brasil",awayTeamId:"FRA",awayTeamName:"França",venue:"Demonstração",kickoffAt:Timestamp.fromDate(new Date("2026-05-30T18:00:00.000Z")),status:"FINISHED",scoringStatus:"PENDING",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  const odd=generateOddMestreGuess([{home:1,away:1,odd:6.2,liquidity:24000},{home:1,away:0,odd:6.8,liquidity:19000},{home:2,away:1,odd:7.1,liquidity:21000}],"Exchange de demonstração","2026-05-29T18:00:00.000Z","https://example.com");
  const maria=generateMariaGuess([{home:2,away:1},{home:1,away:1},{home:3,away:1},{home:2,away:0},{home:1,away:2},{home:2,away:1}]);
  const bounds={minLogGdp:Math.log(5000),maxLogGdp:Math.log(130000),minHdi:0.55,maxHdi:0.96};
  const faria=generateFariaLimmerGuess({countryName:"Brasil",gdpPerCapitaPpp:22300,gdpYear:2025,hdi:0.786,hdiYear:2024},{countryName:"França",gdpPerCapitaPpp:65200,gdpYear:2025,hdi:0.920,hdiYear:2024},bounds,{datasetVersion:"demo-2026-v1"});
  const pangare=generatePangareGuess({matchId:demoId,secret:process.env.APP_SECRET!,favoriteSide:"AWAY"});
  await saveBotGuess(demoId,bots[0]!,odd); await saveBotGuess(demoId,bots[1]!,maria); await saveBotGuess(demoId,bots[2]!,faria); await saveBotGuess(demoId,bots[3]!,pangare);
  for(let i=0;i<bots.length;i++){await db.collection("rankings").doc(`overall_${bots[i]!.id}`).set({competitionId:"overall",participantId:bots[i]!.id,displayName:bots[i]!.name,totalPoints:18-i*2,exactHits:3-i%2,previousPosition:i+2,updatedAt:FieldValue.serverTimestamp()});}
  console.log("Seed concluído. Agora execute npm run import:fifa para carregar o CSV.");
}
main().catch(err=>{console.error(err);process.exit(1);});
