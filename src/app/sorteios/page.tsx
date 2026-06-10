import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import DrawsClient from "@/components/DrawsClient";
import { getCurrentUser } from "@/lib/auth/session";
import { loadPublicDrawSessions } from "@/lib/draws/sessions";

export const dynamic = "force-dynamic";

export default async function SorteiosPage() {
  if (!(await getCurrentUser())) redirect("/login");
  const initial = await loadPublicDrawSessions().catch(() => ({
    sessions: [],
    currentSessionId: null,
  }));

  return <div className="shell">
    <NavBar />
    <main className="container">
      <div className="section-head">
        <div>
          <div className="eyebrow">Bolinha na gaiola</div>
          <h2>Sorteios ao vivo</h2>
          <p className="muted">Acompanhe a formação dos grupos e a distribuição dos três Times Carisma.</p>
        </div>
      </div>
      <DrawsClient
        initialSessions={initial.sessions}
        initialCurrentSessionId={initial.currentSessionId}
      />
    </main>
  </div>;
}
