import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import DrawsClient from "@/components/DrawsClient";
import CarismaPotsManager from "@/components/CarismaPotsManager";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminSorteiosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/classificacao");
  return <div className="shell"><NavBar/><main className="container admin-wide-container"><div className="section-head"><div><div className="eyebrow">Área restrita</div><h2>Central de sorteios</h2><p className="muted">Crie ensaios, conduza o sorteio oficial e revele cada bolinha no ritmo da transmissão.</p></div></div><DrawsClient admin/><CarismaPotsManager/></main></div>;
}
