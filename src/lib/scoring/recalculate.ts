import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export async function recalculateOverallRankings():Promise<void>{
  const snap=await adminDb.collection("scoreEvents").where("active","==",true).get();
  const bestByMatchParticipant=new Map<string,any>();
  for(const doc of snap.docs){const e=doc.data();const key=`${e.matchId}:${e.participantId}`;const current=bestByMatchParticipant.get(key);if(!current || e.totalPoints>current.totalPoints)bestByMatchParticipant.set(key,e);}
  const totals=new Map<string,{displayName:string;totalPoints:number;exactHits:number}>();
  for(const e of bestByMatchParticipant.values()){
    const row=totals.get(e.participantId)??{displayName:e.participantName,totalPoints:0,exactHits:0};
    row.totalPoints+=e.totalPoints; if(e.baseCode==="BASE_EXACT_SCORE")row.exactHits+=1; totals.set(e.participantId,row);
  }
  const existing=await adminDb.collection("rankings").where("competitionId","==","overall").get();
  const previous=new Map(existing.docs.map(d=>[d.data().participantId,d.data().position]));
  const sorted=[...totals.entries()].sort((a,b)=>b[1].totalPoints-a[1].totalPoints||b[1].exactHits-a[1].exactHits);
  const batch=adminDb.batch();
  sorted.forEach(([participantId,row],index)=>batch.set(adminDb.collection("rankings").doc(`overall_${participantId}`),{competitionId:"overall",participantId,displayName:row.displayName,totalPoints:row.totalPoints,exactHits:row.exactHits,position:index+1,previousPosition:previous.get(participantId)??null,updatedAt:FieldValue.serverTimestamp()},{merge:true}));
  await batch.commit();
}
