import NavBar from "@/components/NavBar";

const rules = [
  { number: "01", title: "Quatro grupos de quatro", text: "Os 12 participantes humanos e os quatro bots são sorteados em quatro grupos. Cada grupo recebe um bot e três humanos." },
  { number: "02", title: "Três confrontos diretos", text: "A cada rodada da fase de grupos, cada participante enfrenta um adversário. Vitória vale 3 pontos, empate vale 1 e derrota vale 0." },
  { number: "03", title: "Pontos feitos como desempate", text: "A classificação do grupo considera primeiro os pontos dos confrontos; depois, pontos feitos, saldo de pontos, placares exatos e sorteio oficial." },
  { number: "04", title: "Dois líderes com bye", text: "Ao fim da fase de grupos, os dois melhores líderes descansam nos 16-avos. A composição final das chaves Pedreiros e Pangas será consolidada após o debate dos participantes." },
  { number: "05", title: "Três Times Carisma sorteados", text: "Cada participante recebe uma seleção de cada pote. Durante a fase de grupos, as três permanecem disponíveis; no mata-mata, as seleções ainda vivas ficam liberadas para todos." },
  { number: "06", title: "Sorteio público e auditável", text: "Grupos e Times Carisma são revelados bolinha por bolinha. O administrador conduz o ritmo, e todos os usuários conectados acompanham a mesma sequência." },
];

const bots = [
  ["OddMestre", "Seleciona o placar considerado mais provável pelas odds capturadas 24 horas antes do jogo."],
  ["Maria Vai Com as Outras", "Calcula a média dos palpites humanos e arredonda valores terminados em 0,5 para cima."],
  ["Faria Limmer", "Transforma PIB per capita PPP e IDH em um índice socioeconômico, convertido em gols."],
  ["Pangaré", "Usa uma distribuição caótica, porém reproduzível e inspirada no histórico das Copas."],
];

export default function RegulamentoPage() {
  return <div className="shell"><NavBar/><main className="container regulation-page">
    <section className="regulation-hero snickers-hero"><div><div className="eyebrow yellow-eyebrow">Regulamento executivo em atualização</div><h1>Mundial Snickers<br/>do Carisma 2026</h1><p>16 participantes, grupos próprios, confrontos diretos, sorteios ao vivo, quatro bots explicáveis e uma competição que ainda receberá o novo modelo definitivo de pontuação.</p><div className="actions"><a className="button button-yellow" href="/regulamento-oficial-super-bolao-2026.pdf" target="_blank" rel="noreferrer">Abrir PDF da versão anterior</a></div></div><div className="sponsor-card regulation-sponsor"><div className="chocolate-bar"><i/><b>SNICKERS</b><small>DO CARISMA</small></div><p>Patrocínio fictício. Rivalidade real.</p></div></section>
    <section className="executive-summary"><div className="eyebrow">Em uma frase</div><p>Uma Copa dentro da Copa: os participantes disputam grupos próprios em três rodadas, acumulam pontos nos confrontos diretos e avançam para um mata-mata com vantagem para os dois melhores líderes.</p></section>
    <section className="rules-grid">{rules.map((rule)=><article className="rule-card" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}</section>
    <section className="card regulation-section"><div className="section-head"><div><div className="eyebrow">Participantes especiais</div><h2>Quatro bots, quatro personalidades</h2></div></div><div className="bot-rule-grid">{bots.map(([name,text])=><article key={name}><strong>{name}</strong><p>{text}</p></article>)}</div><p className="muted">Todo palpite de bot possui memória de cálculo pública, liberada após o fechamento, com dados de entrada, fonte, fórmula e eventual intervenção administrativa.</p></section>
    <section className="regulation-flow"><div><span>1</span><strong>Sorteios</strong><small>Grupos e Carisma</small></div><b>→</b><div><span>2</span><strong>Fase de grupos</strong><small>3 rodadas e confrontos</small></div><b>→</b><div><span>3</span><strong>Dois byes</strong><small>Melhores líderes</small></div><b>→</b><div><span>4</span><strong>Mata-mata</strong><small>Pedreiros e Pangas</small></div></section>
    <section className="card"><h3>Nota de transição</h3><p className="muted">O PDF oficial disponível no site ainda representa a versão anterior. O novo modelo de pontuação e a composição definitiva do mata-mata serão incorporados numa revisão formal posterior, sem alterar os sorteios e a fase de grupos já estruturados nesta versão.</p></section>
  </main></div>;
}
