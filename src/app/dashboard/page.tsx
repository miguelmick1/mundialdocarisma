import Image from "next/image";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import CountryFlag from "@/components/CountryFlag";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

async function getLiveMatches() {
  try { const snap = await adminDb.collection("matches").where("status", "in", ["LIVE", "HALFTIME", "EXTRA_TIME"]).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a:any,b:any)=>Number(a.matchNumber??0)-Number(b.matchNumber??0)).slice(0,3); } catch { return []; }
}

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile(); if (!profile) redirect("/login");
  const liveMatches = await getLiveMatches();
  return <div className="shell"><NavBar/><main className="container">
    {liveMatches.length ? <section className="dashboard-live-band"><div className="dashboard-live-title"><span className="live-pulse">● AO VIVO</span><strong>{liveMatches.length} partida(s) acontecendo</strong></div><div className="dashboard-live-games">{liveMatches.map((match:any)=><a key={match.id} href="/resultados"><span><CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName}/>{match.homeTeamName}</span><b>{match.liveHomeScore??0} × {match.liveAwayScore??0}</b><span>{match.awayTeamName}<CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName}/></span></a>)}</div></section>:null}
    <section className="dashboard-welcome dashboard-story-welcome"><div><div className="eyebrow yellow-eyebrow">Bem-vindo, {profile.displayName}</div><h2>O Mundial Snickers do Carisma começou.</h2><p className="dashboard-history-copy">A turma que se conheceu durante a Copa de 2002 agora disputa grupos próprios, confrontos diretos e Times Carisma sorteados. Aqui, cada rodada vale uma história — e alguma humilhação pública.</p><div className="actions"><a className="button button-yellow" href="/classificacao">Ver classificação</a><a className="button button-ghost-light" href="/palpites">Fazer palpites</a></div></div><div className="dashboard-memory-photo"><Image src="/historia/turma-2026.jpeg" alt="Foto recente da turma" fill sizes="320px"/></div></section>
    <section className="dashboard-grid"><a className="dashboard-card primary-dashboard-card" href="/classificacao"><span>01</span><div><h3>Classificação</h3><p>Grupos, confrontos e corrida pelos dois byes.</p><b>Abrir classificação →</b></div></a><a className="dashboard-card" href="/palpites"><span>02</span><div><h3>Palpites</h3><p>104 partidas, Time Carisma único na fase de grupos e palpites de todos após o início dos jogos.</p><b>Fazer palpites →</b></div></a><a className="dashboard-card" href="/sorteios"><span>03</span><div><h3>Sorteios</h3><p>Assista à formação dos grupos e à distribuição do Carisma.</p><b>Acompanhar →</b></div></a><a className="dashboard-card" href="/resultados"><span>04</span><div><h3>Resultados</h3><p>Placar, pontuação por jogo e acompanhamento ao vivo.</p><b>Ver resultados →</b></div></a><a className="dashboard-card" href="/bots"><span>05</span><div><h3>Bots</h3><p>Memórias de cálculo e fontes de cada palpite.</p><b>Conhecer bots →</b></div></a><a className="dashboard-card" href="/regulamento"><span>06</span><div><h3>Regulamento</h3><p>Regras executivas e estrutura da competição.</p><b>Consultar →</b></div></a></section>
  </main></div>;
}
