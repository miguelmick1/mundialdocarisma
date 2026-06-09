import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import DrawsClient from "@/components/DrawsClient";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SorteiosPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <div className="shell"><NavBar/><main className="container"><div className="section-head"><div><div className="eyebrow">Bolinha na gaiola</div><h2>Sorteios ao vivo</h2><p className="muted">Acompanhe a formação dos grupos e a distribuição dos três Times Carisma.</p></div></div><DrawsClient/></main></div>;
}
