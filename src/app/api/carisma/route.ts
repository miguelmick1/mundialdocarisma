import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime="nodejs";
const schema=z.object({roundId:z.string().min(1),teamId:z.string().min(1)});

export async function PUT(request:NextRequest){
  try{
    assertSameOrigin(request); const user=await requireUser(); const input=schema.parse(await request.json());
    const selectionRef=adminDb.collection("carismaSelections").doc(`${input.roundId}_${user.uid}`);
    await adminDb.runTransaction(async tx=>{
      const teamRef=adminDb.collection("teams").doc(input.teamId);
      const [teamSnap,roundMatchesSnap,existing]=await Promise.all([
        tx.get(teamRef),
        tx.get(adminDb.collection("roundMatches").where("roundId","==",input.roundId)),
        tx.get(selectionRef)
      ]);
      if(!teamSnap.exists || teamSnap.data()?.eliminatedAt)throw new Error("TEAM_NOT_ELIGIBLE");
      const matchIds=roundMatchesSnap.docs.map(d=>d.data().matchId as string);
      if(matchIds.length===0)throw new Error("ROUND_EMPTY");
      const matchSnaps=await Promise.all(matchIds.map(id=>tx.get(adminDb.collection("matches").doc(id))));
      const teamMatches=matchSnaps.filter(s=>s.exists && [s.data()!.homeTeamId,s.data()!.awayTeamId].includes(input.teamId));
      if(teamMatches.length===0)throw new Error("TEAM_NOT_IN_ROUND");
      const firstKickoff=Math.min(...teamMatches.map(s=>(s.data()!.kickoffAt.toDate() as Date).getTime()));
      if(Date.now()>=firstKickoff)throw new Error("TEAM_ALREADY_PLAYED");
      if(existing.exists){
        const oldTeamId=existing.data()!.teamId;
        const oldMatches=matchSnaps.filter(s=>s.exists && [s.data()!.homeTeamId,s.data()!.awayTeamId].includes(oldTeamId));
        const oldFirst=Math.min(...oldMatches.map(s=>(s.data()!.kickoffAt.toDate() as Date).getTime()));
        if(Date.now()>=oldFirst)throw new Error("SELECTION_LOCKED");
      }
      tx.set(selectionRef,{roundId:input.roundId,participantId:user.uid,teamId:input.teamId,selectedAt:existing.exists?existing.data()!.selectedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    });
    return NextResponse.json({ok:true});
  }catch(error){const code=(error as Error).message;const messages:Record<string,string>={TEAM_NOT_ELIGIBLE:"A seleção não está mais viva.",TEAM_NOT_IN_ROUND:"A seleção não joga nesta rodada.",TEAM_ALREADY_PLAYED:"Esta seleção já entrou em campo.",SELECTION_LOCKED:"Sua escolha já foi bloqueada.",ROUND_EMPTY:"Rodada sem jogos configurados."};return NextResponse.json({error:messages[code]??"Não foi possível escolher o Time Carisma."},{status:409});}
}
