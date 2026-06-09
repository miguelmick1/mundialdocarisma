import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import ParticipantsManager from "@/components/ParticipantsManager";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";

export default async function AdminParticipantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/classificacao");

  return <div className="shell">
    <NavBar />
    <main className="container admin-wide-container">
      <div className="section-head">
        <div>
          <div className="eyebrow">Elenco do Mundial</div>
          <h2>Participantes e fotos</h2>
          <p className="muted">Edite nomes, complete avatares e confira grupos e Times Carisma.</p>
        </div>
      </div>
      <ParticipantsManager />
    </main>
  </div>;
}
