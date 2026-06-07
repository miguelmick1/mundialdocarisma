import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";

export const runtime="nodejs";
const schema=z.object({matchId:z.string().min(1),action:z.enum(["FINISH","VOID"]),homeScore90:z.number().int().min(0).max(30).optional(),awayScore90:z.number().int().min(0).max(30).optional(),homeScore120:z.number().int().min(0).max(30).optional(),awayScore120:z.number().int().min(0).max(30).optional(),voidReason:z.string().max(300).optional()});

export async function POST(request:NextRequest){
  try{
    assertSameOrigin(request); const actor=await requireAdmin(); const input=schema.parse(await request.json());
    const matchRef=adminDb.collection("matches").doc(input.matchId); const matchSnap=await matchRef.get(); if(!matchSnap.exists)return NextResponse.json({error:"Partida não encontrada"},{status:404}); const match=matchSnap.data()!;
    const oldEvents=await adminDb.collection("scoreEvents").where("matchId","==",input.matchId).where("active","==",true).get();
    const batch=adminDb.batch(); oldEvents.docs.forEach(d=>batch.update(d.ref,{active:false,supersededAt:FieldValue.serverTimestamp(),supersededReason:input.action==="VOID"?"MATCH_VOIDED":"RESULT_RECALCULATED"}));
    if(input.action==="VOID"){
      batch.update(matchRef,{status:"VOID",scoringStatus:"VOID",voidReason:input.voidReason??"ADMINISTRATIVE_VOID",updatedAt:FieldValue.serverTimestamp()});
      batch.set(adminDb.collection("auditLogs").doc(),{type:"MATCH_VOIDED",actorUid:actor.uid,matchId:input.matchId,reason:input.voidReason??null,createdAt:FieldValue.serverTimestamp()}); await batch.commit(); await recalculateOverallRankings(); return NextResponse.json({ok:true,status:"VOID"});
    }
    if(input.homeScore90===undefined||input.awayScore90===undefined)throw new Error("SCORE_REQUIRED");
    const actual={home:input.homeScore120??input.homeScore90,away:input.awayScore120??input.awayScore90};
    batch.update(matchRef,{status:"FINISHED",scoringStatus:"CALCULATED",homeScore90:input.homeScore90,awayScore90:input.awayScore90,homeScore120:input.homeScore120??null,awayScore120:input.awayScore120??null,updatedAt:FieldValue.serverTimestamp()});
    const guesses=await adminDb.collection("guesses").where("matchId","==",input.matchId).get();
    const carismaByParticipant=new Map<string,string>();
    if(match.competitionRoundId){const cs=await adminDb.collection("carismaSelections").where("roundId","==",match.competitionRoundId).get();cs.docs.forEach(d=>carismaByParticipant.set(d.data().participantId,d.data().teamId));}
    guesses.docs.forEach(g=>{const guess=g.data();const result=calculateScoreWithCarisma({guess:{home:guess.homeScore,away:guess.awayScore},actual,homeTeamId:match.homeTeamId,awayTeamId:match.awayTeamId,carismaTeamId:carismaByParticipant.get(guess.participantId)});const baseCode=result.components[0]?.code??"BASE_MISS";batch.set(adminDb.collection("scoreEvents").doc(`${input.matchId}_${guess.participantId}_${guess.slot}_v1`),{matchId:input.matchId,participantId:guess.participantId,participantName:guess.participantName,guessId:g.id,slot:guess.slot,ruleSetVersion:1,baseCode,totalPoints:result.total,components:result.components,active:true,calculatedAt:FieldValue.serverTimestamp()},{merge:true});});
    batch.set(adminDb.collection("auditLogs").doc(),{type:"MATCH_RESULT_CONFIRMED",actorUid:actor.uid,matchId:input.matchId,actual,createdAt:FieldValue.serverTimestamp()}); await batch.commit(); await recalculateOverallRankings(); return NextResponse.json({ok:true,status:"FINISHED",actual});
  }catch(error){console.error(error);return NextResponse.json({error:(error as Error).message==="SCORE_REQUIRED"?"Informe o placar de 90 minutos.":"Não foi possível processar o resultado."},{status:400});}
}
