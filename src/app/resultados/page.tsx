import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import ResultsClient from "@/components/ResultsClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ResultadosPage() {
  if (!(await getCurrentUser())) redirect("/login");

  return (
    <div className="shell">
      <NavBar />
      <main className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow">Placar e memória de pontos</div>
            <h2>Resultados por jogo</h2>
            <p className="muted">Escolha uma partida para ver os palpites e a pontuação obtida por cada participante naquele jogo.</p>
          </div>
        </div>
        <ResultsClient />
      </main>
    </div>
  );
}
