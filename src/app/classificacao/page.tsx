import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import CompetitionClassificationClient from "@/components/CompetitionClassificationClient";
import ClassificationGroupPhoto from "@/components/ClassificationGroupPhoto";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ClassificacaoPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell">
    <NavBar />
    <main className="container">
      <div className="section-head competition-heading">
        <div><div className="eyebrow">Mundial Snickers do Carisma</div><h2>Classificação</h2><p className="muted">Grupos de participantes, confrontos rodada a rodada e caminho para o mata-mata.</p></div>
      </div>
      <ClassificationGroupPhoto />
      <CompetitionClassificationClient />
    </main>
  </div>;
}
