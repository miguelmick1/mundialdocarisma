import Image from "next/image";
import Link from "next/link";
import NavBar from "@/components/NavBar";

const history = [
  { src: "/historia/turma-2002.jpeg", label: "O começo", caption: "Os primeiros anos da turma, quando Copa e faculdade passaram a dividir o mesmo calendário." },
  { src: "/historia/turma-intermediaria.jpeg", label: "A tradição", caption: "A amizade continuou, os encontros mudaram e o bolão virou parte da história." },
  { src: "/historia/turma-2026.jpeg", label: "A meia-idade", caption: "Vinte e quatro anos depois, a turma está pronta para o Mundial mais carismático de todos." },
];

export default function HomePage() {
  return <div className="shell"><NavBar/><main>
    <section className="home-hero snickers-hero"><div className="container home-hero-grid"><div><div className="eyebrow yellow-eyebrow">Copa do Mundo 2026</div><h1>Mundial Snickers<br/>do Carisma.</h1><p className="hero-copy light-copy">Tudo começou na Copa de 2002, quando esta turma pedreira se conheceu na Faculdade de Ciências Econômicas da UFRGS. Agora, 24 anos depois, chega à meia-idade e se prepara para o mais carismático de todos os bolões.</p><p className="hero-story">São 16 participantes, quatro bots, grupos próprios, confrontos diretos, Times Carisma sorteados e uma disputa que mistura futebol, amizade e um nível questionável de provocação.</p><div className="actions"><Link className="button button-yellow" href="/login">Entrar no Mundial</Link><Link className="button button-ghost-light" href="/sorteios">Conhecer os sorteios</Link></div></div><div className="sponsor-card"><span className="sponsor-kicker">Patrocínio completamente fictício</span><div className="chocolate-bar"><i/><b>SNICKERS</b><small>DO CARISMA</small></div><p>Você não é você quando está perdendo o confronto da rodada.</p><small className="legal-note">Competição privada entre amigos, sem vínculo com Mars ou Snickers.</small></div></div></section>

    <section className="container history-section"><div className="section-head"><div><div className="eyebrow">Desde 2002</div><h2>Uma Copa contada em reencontros</h2><p className="muted">As fotos de grupo entram como memória da turma; os avatares individuais poderão ser adicionados depois no perfil de cada participante.</p></div></div><div className="history-gallery">{history.map((item) => <article key={item.src}><div className="history-photo"><Image src={item.src} alt="Foto histórica da turma" fill sizes="(max-width: 800px) 90vw, 33vw"/></div><span>{item.label}</span><h3>{item.caption}</h3></article>)}</div></section>

    <section className="container home-features"><div className="section-head"><div><div className="eyebrow">O campeonato</div><h2>Mais do que um ranking</h2></div></div><div className="grid"><article className="card feature-card"><span className="feature-icon">🏟️</span><h3>Quatro grupos</h3><p className="muted">Confrontos em três rodadas, com vitória valendo três pontos e desempate pelos pontos feitos.</p></article><article className="card feature-card"><span className="feature-icon">🎱</span><h3>Sorteio ao vivo</h3><p className="muted">Grupos e Times Carisma revelados bolinha por bolinha para todos os participantes conectados.</p></article><article className="card feature-card"><span className="feature-icon">🤖</span><h3>Bots explicáveis</h3><p className="muted">Cada bot revela dados, fonte e memória do cálculo, sem caixa-preta.</p></article></div></section>
  </main><footer className="footer">Mundial Snickers do Carisma 2026 · patrocínio fictício · turma de Economia UFRGS</footer></div>;
}
