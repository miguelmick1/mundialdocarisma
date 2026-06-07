import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser, isAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { sha256 } from "@/lib/utils/hash";
import { getServerEnv } from "@/lib/env";

export const runtime="nodejs";
const schema=z.object({maxUses:z.number().int().min(1).max(100).default(20),expiresInDays:z.number().int().min(1).max(30).default(7)});

export async function POST(request:NextRequest,context:{params:Promise<{groupId:string}>}){
  try{
    assertSameOrigin(request); const user=await requireUser(); const {groupId}=await context.params; const input=schema.parse(await request.json());
    const membership=await adminDb.collection("groupMembers").doc(`${groupId}_${user.uid}`).get();
    const allowed=(membership.exists && ["OWNER","ADMIN"].includes(membership.data()?.role)) || await isAdmin(user.uid);
    if(!allowed)return NextResponse.json({error:"Acesso negado"},{status:403});
    const rawToken=randomBytes(32).toString("base64url"); const ref=adminDb.collection("groupInvites").doc();
    await ref.set({groupId,tokenHash:sha256(rawToken),createdByUid:user.uid,maxUses:input.maxUses,useCount:0,expiresAt:Timestamp.fromDate(new Date(Date.now()+input.expiresInDays*86400000)),revokedAt:null,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    return NextResponse.json({inviteId:ref.id,url:`${getServerEnv().APP_URL}/invite/${rawToken}`});
  }catch(error){console.error(error);return NextResponse.json({error:"Não foi possível criar o convite."},{status:400});}
}
