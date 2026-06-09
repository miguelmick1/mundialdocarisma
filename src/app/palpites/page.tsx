import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import PredictionsClient from "@/components/PredictionsClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function PalpitesPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell"><NavBar /><main className="container"><div className="section-head"><div><div className="eyebrow">Fábrica de Palpites</div><h2>Palpites do Mundial do Carisma</h2><p className="muted">Filtre as 104 partidas e escolha, na fase de grupos, entre os três Times Carisma recebidos no sorteio.</p></div></div><PredictionsClient /></main></div>;
}
