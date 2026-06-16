import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import RoundBulletinAdminClient from "@/components/RoundBulletinAdminClient";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function RoundBulletinAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/dashboard");

  return <div className="shell"><NavBar /><main className="container admin-wide-container"><div className="section-head"><div><div className="eyebrow">Área restrita</div><h2>Boletim da rodada</h2><p className="muted">Monte o boletim, gere a versão em PDF e envie o popup para todos os participantes.</p></div></div><RoundBulletinAdminClient /></main></div>;
}
