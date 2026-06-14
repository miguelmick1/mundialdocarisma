import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import ParticipantGuessesManager from "@/components/ParticipantGuessesManager";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function AdminParticipantGuessesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/classificacao");

  return <div className="shell"><NavBar /><main className="container admin-wide-container">
    <div className="section-head"><div><div className="eyebrow">Administração · Participantes</div><h2>Palpites administrativos</h2><p className="muted">Correções retroativas ficam registradas no histórico e na auditoria.</p></div><a className="button" href="/admin">← Voltar ao painel</a></div>
    <ParticipantGuessesManager />
  </main></div>;
}
