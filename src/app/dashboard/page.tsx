import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getCurrentUserProfile } from "@/lib/auth/session";

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  return <div className="shell"><NavBar/><main className="container">
    <section className="dashboard-welcome dashboard-story-welcome">
      <div>
        <div className="eyebrow yellow-eyebrow">Bem-vindo, {profile.displayName}</div>
        <h2>Uma turma pedreira. Uma tradição de Copa.</h2>
        <p className="dashboard-history-copy">Tudo começou na Copa de 2002, quando esta turma pedreira se conheceu na Faculdade de Ciências Econômicas da UFRGS. As aulas começaram exatamente junto com a Copa — e, entre teoria econômica, cafés e jogos em horários improváveis, nasceu uma amizade que atravessou mais de duas décadas. Agora, 24 anos depois, esta turma chega à meia idade e se prepara para o mais carismático de todos os bolões!</p>
        <p className="dashboard-secondary-copy">Nesta edição, serão 104 jogos, quatro bots com personalidade, Time Carisma e dois campeonatos paralelos para descobrir quem realmente entende de futebol — e quem apenas teve sorte na hora certa.</p>
      </div>
      <div className="dashboard-ball">⚽</div>
    </section>

    <section className="dashboard-grid">
      <a className="dashboard-card primary-dashboard-card" href="/palpites"><span>01</span><div><h3>Fábrica de Palpites</h3><p>As 104 partidas, organizadas por rodada e grupo.</p><b>Fazer palpites →</b></div></a>
      <a className="dashboard-card" href="/classificacao"><span>02</span><div><h3>Classificação da Copa</h3><p>Acompanhe os 12 grupos e os classificados.</p><b>Ver tabela →</b></div></a>
      <a className="dashboard-card" href="/resultados"><span>03</span><div><h3>Resultados por jogo</h3><p>Veja o placar, os palpites e quantos pontos cada jogador fez.</p><b>Ver resultados →</b></div></a>
      <a className="dashboard-card" href="/ranking"><span>04</span><div><h3>Ranking do Bolão</h3><p>Pontos corridos, exatos e mudança de posições.</p><b>Ver ranking →</b></div></a>
      <a className="dashboard-card" href="/bots"><span>05</span><div><h3>Bots explicáveis</h3><p>Veja como cada máquina chegou ao palpite.</p><b>Abrir memórias →</b></div></a>
      <a className="dashboard-card" href="/regulamento"><span>06</span><div><h3>Regulamento</h3><p>Regras executivas, pontuação e mata-mata.</p><b>Consultar regras →</b></div></a>
      <a className="dashboard-card" href="/perfil"><span>07</span><div><h3>Meu perfil</h3><p>Defina o nome que aparece no bolão e no ranking.</p><b>Editar nome →</b></div></a>
    </section>

    <section className="rule-score-band"><div><strong>5</strong><span>Placar exato</span></div><div><strong>4</strong><span>Saldo exato</span></div><div><strong>3</strong><span>Resultado correto</span></div><p>Palpites fecham exatamente no início de cada partida.</p></section>
  </main></div>;
}
