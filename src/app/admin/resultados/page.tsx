import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import AdminResultsManager from "@/components/AdminResultsManager";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function AdminResultsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/dashboard");

  return <div className="shell"><NavBar /><main className="container admin-wide-container">
    <div className="section-head"><div><div className="eyebrow">Administração · Jogos</div><h2>Central de resultados</h2><p className="muted">Alimente o placar ao vivo manualmente agora e, futuramente, revise os dados recebidos da API-Football.</p></div><a className="button" href="/admin">← Voltar ao painel</a></div>
    <AdminResultsManager />
  </main></div>;
}
