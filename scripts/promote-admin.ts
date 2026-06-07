import { config } from "dotenv";
config({ path: ".env.local" });
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const email=process.argv[2]?.trim().toLowerCase();
if(!email){console.error("Uso: npm run promote:admin -- usuario@email.com");process.exit(1);}
const projectId=process.env.FIREBASE_PROJECT_ID!; const clientEmail=process.env.FIREBASE_CLIENT_EMAIL!; const privateKey=process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g,"\n");
if(!getApps().length) initializeApp({credential:cert({projectId,clientEmail,privateKey})});
const auth=getAuth(); const db=getFirestore();
const user=await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid,{admin:true,role:"ADMIN"});
await db.collection("admins").doc(user.uid).set({uid:user.uid,email:user.email,displayName:user.displayName??user.email,role:"ADMIN",status:"ACTIVE",isBootstrapAdmin:email===process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase(),updatedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()},{merge:true});
console.log(`${email} agora é administrador. Peça para sair e entrar novamente.`);
