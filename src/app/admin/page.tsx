import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import AdminClient from "@/components/AdminClient";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/dashboard");

  return <div className="shell"><NavBar/><main className="container"><div className="section-head"><div><div className="eyebrow">Área restrita</div><h2>Administração do Super Bolão</h2><p className="muted">Toda operação sensível gera log de auditoria.</p></div></div><AdminClient/></main></div>;
}
