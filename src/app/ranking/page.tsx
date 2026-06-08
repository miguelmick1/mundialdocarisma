import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getCurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type RankingRow = {
  id: string;
  participantId?: string;
  displayName?: string;
  totalPoints?: number;
  exactHits?: number;
  previousPosition?: number;
};

export default async function RankingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // O bolão tem poucos participantes. Ordenar em memória evita depender de
  // um índice composto do Firestore e mantém os dois critérios oficiais.
  const snap = await adminDb.collection("rankings").get();
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as RankingRow)
    .sort((a, b) => {
      const pointsDifference = (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
      if (pointsDifference !== 0) return pointsDifference;
      const exactDifference = (b.exactHits ?? 0) - (a.exactHits ?? 0);
      if (exactDifference !== 0) return exactDifference;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "", "pt-BR");
    })
    .slice(0, 50);

  return (
    <div className="shell">
      <NavBar />
      <main className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow">Classificação</div>
            <h2>Ranking geral</h2>
            <p className="muted">Primeiro critério de desempate: maior número de placares exatos.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Posição</th><th>Participante</th><th>Pontos</th><th>Exatos</th><th>Tendência</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row, index) => (
                <tr key={row.id} style={row.participantId === user.uid ? { fontWeight: 900, background: "#e6f8f2" } : undefined}>
                  <td>{index + 1}º</td>
                  <td>{row.displayName ?? "Participante"}</td>
                  <td>{row.totalPoints ?? 0}</td>
                  <td>{row.exactHits ?? 0}</td>
                  <td>{row.previousPosition ? (row.previousPosition > index + 1 ? "▲" : row.previousPosition < index + 1 ? "▼" : "—") : "—"}</td>
                </tr>
              )) : <tr><td colSpan={5}>Ranking ainda não calculado.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
