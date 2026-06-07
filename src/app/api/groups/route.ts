import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";
const schema=z.object({name:z.string().min(3).max(100)});

export async function POST(request:NextRequest){
  try{
    assertSameOrigin(request); const user=await requireUser(); const {name}=schema.parse(await request.json());
    const groupRef=adminDb.collection("groups").doc();
    const memberRef=adminDb.collection("groupMembers").doc(`${groupRef.id}_${user.uid}`);
    const batch=adminDb.batch();
    batch.set(groupRef,{name,ownerUserId:user.uid,status:"ACTIVE",visibility:"PRIVATE",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    batch.set(memberRef,{groupId:groupRef.id,userId:user.uid,role:"OWNER",status:"ACTIVE",joinedAt:FieldValue.serverTimestamp()});
    await batch.commit(); return NextResponse.json({groupId:groupRef.id,name},{status:201});
  }catch(error){if((error as Error).message==="UNAUTHENTICATED")return NextResponse.json({error:"Não autenticado"},{status:401});console.error(error);return NextResponse.json({error:"Não foi possível criar o grupo."},{status:400});}
}
