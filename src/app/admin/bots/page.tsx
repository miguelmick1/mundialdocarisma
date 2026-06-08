import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import BotGuessesManager from "@/components/BotGuessesManager";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function AdminBotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/dashboard");

  return <div className="shell"><NavBar /><main className="container admin-wide-container">
    <div className="section-head"><div><div className="eyebrow">Administração · Bots</div><h2>Palpites dos bots</h2><p className="muted">Revise todos os jogos do bot selecionado e registre intervenções manuais sem digitar IDs.</p></div><a className="button" href="/admin">← Voltar ao painel</a></div>
    <BotGuessesManager />
  </main></div>;
}
