import { NextResponse } from "next/server";
import { secureCookieName } from "@/lib/security/http";

export async function GET(request:Request,context:{params:Promise<{token:string}>}){
  const {token}=await context.params;
  const response=NextResponse.redirect(new URL("/login?invite=1",request.url));
  response.cookies.set(secureCookieName("pending-invite"),token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60});
  return response;
}
