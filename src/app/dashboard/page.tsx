import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import CountryFlag from "@/components/CountryFlag";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

async function getLiveMatches() {
  try {
    const snap = await adminDb.collection("matches").where("status", "in", ["LIVE", "HALFTIME", "EXTRA_TIME"]).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  const liveMatches = await getLiveMatches();

  return <div className="shell"><NavBar/><main className="container">
    {liveMatches.length ? <section className="dashboard-live-band"><div className="dashboard-live-title"><span className="live-pulse">● AO VIVO</span><strong>{liveMatches.length === 1 ? "1 partida acontecendo" : `${liveMatches.length} partidas acontecendo`}</strong></div><div className="dashboard-live-games">{liveMatches.map((match: any) => <a key={match.id} href="/resultados"><span><CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName} />{match.homeTeamName}</span><b>{match.liveHomeScore ?? 0} × {match.liveAwayScore ?? 0}</b><span>{match.awayTeamName}<CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName} /></span><small>{match.liveMinute != null ? `${match.liveMinute}'` : match.status === "HALFTIME" ? "Intervalo" : "Ao vivo"}</small></a>)}</div><a className="button" href="/resultados">Ver pontuação provisória →</a></section> : null}

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
      <a className="dashboard-card" href="/resultados"><span>03</span><div><h3>Resultados e placar ao vivo</h3><p>Veja o placar, os palpites e a pontuação provisória ou oficial.</p><b>Ver resultados →</b></div></a>
      <a className="dashboard-card" href="/ranking"><span>04</span><div><h3>Ranking do Bolão</h3><p>Pontos corridos, exatos e mudança de posições.</p><b>Ver ranking →</b></div></a>
      <a className="dashboard-card" href="/bots"><span>05</span><div><h3>Bots explicáveis</h3><p>Veja como cada máquina chegou ao palpite.</p><b>Abrir memórias →</b></div></a>
      <a className="dashboard-card" href="/regulamento"><span>06</span><div><h3>Regulamento</h3><p>Regras executivas, pontuação e mata-mata.</p><b>Consultar regras →</b></div></a>
      <a className="dashboard-card" href="/perfil"><span>07</span><div><h3>Meu perfil</h3><p>Defina o nome que aparece no bolão e no ranking.</p><b>Editar nome →</b></div></a>
    </section>

    <section className="rule-score-band"><div><strong>5</strong><span>Placar exato</span></div><div><strong>4</strong><span>Saldo exato</span></div><div><strong>3</strong><span>Resultado correto</span></div><p>Palpites fecham exatamente no início de cada partida.</p></section>
  </main></div>;
}
