import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getCurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const user=await getCurrentUser(); if(!user) redirect("/login");
  const snap=await adminDb.collection("rankings").orderBy("totalPoints","desc").orderBy("exactHits","desc").limit(50).get();
  const rows=snap.docs.map(d=>({id:d.id,...d.data()} as any));
  return <div className="shell"><NavBar/><main className="container"><div className="section-head"><div><div className="eyebrow">Classificação</div><h2>Ranking geral</h2><p className="muted">Primeiro critério de desempate: maior número de placares exatos.</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Posição</th><th>Participante</th><th>Pontos</th><th>Exatos</th><th>Tendência</th></tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id} style={r.participantId===user.uid?{fontWeight:900,background:"#e6f8f2"}:undefined}><td>{i+1}º</td><td>{r.displayName}</td><td>{r.totalPoints}</td><td>{r.exactHits}</td><td>{r.previousPosition? (r.previousPosition>i+1?"▲":r.previousPosition<i+1?"▼":"—") : "—"}</td></tr>):<tr><td colSpan={5}>Ranking ainda não calculado.</td></tr>}</tbody></table></div>
  </main></div>;
}
