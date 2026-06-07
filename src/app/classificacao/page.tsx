import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import StandingsClient from "@/components/StandingsClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ClassificacaoPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell">
    <NavBar />
    <main className="container">
      <div className="section-head">
        <div><div className="eyebrow">Módulo da Copa</div><h2>Classificação dos grupos</h2><p className="muted">Acompanhe os 12 grupos, os classificados diretos e a disputa entre os terceiros colocados.</p></div>
      </div>
      <StandingsClient />
    </main>
  </div>;
}
