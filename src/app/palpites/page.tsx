import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import PredictionsHubClient from "@/components/PredictionsHubClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function PalpitesPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell"><NavBar /><main className="container"><div className="section-head"><div><div className="eyebrow">Central de Palpites</div><h2>Palpites do Mundial do Carisma</h2><p className="muted">Registre seus placares e, depois do início de cada jogo, compare os palpites de todos os participantes.</p></div></div><PredictionsHubClient /></main></div>;
}
