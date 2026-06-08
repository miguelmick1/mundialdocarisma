import Link from "next/link";
import NavBar from "@/components/NavBar";

export default function HomePage() {
  return <div className="shell">
    <NavBar />
    <main>
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div>
            <div className="eyebrow yellow-eyebrow">Copa do Mundo 2026</div>
            <h1>Uma turma pedreira.<br/>Uma tradição de Copa.</h1>
            <p className="hero-copy light-copy">Tudo começou na Copa de 2002, quando esta turma pedreira se conheceu na Faculdade de Ciências Econômicas da UFRGS. As aulas começaram exatamente junto com a Copa — e, entre teoria econômica, jogos em horários improváveis e muito truco, nasceu uma amizade que atravessou mais de duas décadas. Agora, 24 anos depois, esta turma chega à meia idade e se prepara para o mais carismático de todos os bolões!</p>
            <p className="hero-story">A Copa volta à América do Norte e a turma volta a campo. São 104 jogos, bots com personalidade, Time Carisma e uma competição desenhada para premiar conhecimento, regularidade e aquela dose de sorte que sempre fez parte da nossa história.</p>
            <div className="actions"><Link className="button button-yellow" href="/login">Entrar no Super Bolão</Link><Link className="button button-ghost-light" href="/regulamento">Conhecer o regulamento</Link></div>
          </div>
          <div className="world-cup-card">
            <div className="cup-ribbon">Desde 2002</div>
            <div className="world-cup-number">104</div><strong>partidas para palpitar</strong>
            <div className="score-demo brazil-score"><span className="team-pill">🇧🇷 Brasil</span><span>2 × 1</span><span className="team-pill">🌍 Mundo</span></div>
            <div className="cup-stats"><span><b>16</b> participantes</span><span><b>4</b> bots</span><span><b>2</b> campeonatos</span></div>
          </div>
        </div>
      </section>
      <section className="container home-features">
        <div className="section-head"><div><div className="eyebrow">O campeonato</div><h2>Feito para acompanhar cada jogo</h2></div></div>
        <div className="grid">
          <article className="card feature-card"><span className="feature-icon">⚽</span><h3>Palpites rápidos</h3><p className="muted">As 104 partidas, filtros por rodada e grupo, autosave e bloqueio pelo relógio do servidor.</p></article>
          <article className="card feature-card"><span className="feature-icon">📊</span><h3>Classificação da Copa</h3><p className="muted">Tabela completa dos grupos, resultados e acompanhamento dos classificados.</p></article>
          <article className="card feature-card"><span className="feature-icon">🤖</span><h3>Bots sem caixa-preta</h3><p className="muted">Cada bot revela a fonte, os dados de entrada e a memória completa do cálculo.</p></article>
        </div>
      </section>
      <section className="container origin-card"><div><div className="eyebrow">A origem</div><h2>Da sala de aula para o mundo</h2><p>Em 2002, a Copa da Coreia e do Japão virou trilha sonora do começo da faculdade. Em 2026, o bolão transforma essa memória em uma nova disputa: profissional na tecnologia, séria nas regras e completamente irresponsável nas provocações.</p></div><div className="origin-years"><span>2002</span><i>→</i><span>2026</span></div></section>
    </main>
    <footer className="footer">Super Bolão Copa do Mundo 2026 · Turma de Economia UFRGS</footer>
  </div>;
}
