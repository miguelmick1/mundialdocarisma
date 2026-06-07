import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import PredictionsClient from "@/components/PredictionsClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function PalpitesPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell"><NavBar /><main className="container"><div className="section-head"><div><div className="eyebrow">Fábrica de Palpites</div><h2>As 104 partidas da Copa</h2><p className="muted">Filtre por rodada, fase ou grupo. Os jogos eliminatórios são liberados assim que as seleções forem definidas.</p></div></div><PredictionsClient /></main></div>;
}
