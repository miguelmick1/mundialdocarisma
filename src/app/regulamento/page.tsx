import NavBar from "@/components/NavBar";

const competitionRules = [
  { number: "01", title: "Quatro grupos de quatro", text: "Os 12 participantes humanos e os quatro bots são sorteados em quatro grupos. Cada grupo recebe um bot e três humanos." },
  { number: "02", title: "Três confrontos diretos", text: "A cada rodada da fase de grupos, cada participante enfrenta um adversário. Vitória vale 3 pontos, empate vale 1 e derrota vale 0." },
  { number: "03", title: "Pontos feitos como desempate", text: "A classificação do grupo considera primeiro os pontos dos confrontos; depois, pontos feitos, saldo de pontos, placares exatos e sorteio oficial." },
  { number: "04", title: "Dois líderes com bye", text: "Ao fim da fase de grupos, os dois melhores líderes descansam nos 16-avos. A composição final das chaves Pedreiros e Pangas será consolidada após o debate dos participantes." },
  { number: "05", title: "Três Times Carisma sorteados", text: "Cada participante recebe uma seleção de cada pote. Durante a fase de grupos, as três permanecem disponíveis; no mata-mata, as seleções ainda vivas ficam liberadas para todos." },
  { number: "06", title: "Sorteio público e auditável", text: "Grupos e Times Carisma são revelados bolinha por bolinha. O administrador conduz o ritmo, e todos os usuários conectados acompanham a mesma sequência." },
];

const baseScoring = [
  ["Placar exato", "5 × número total de gols da partida", "Ex.: 2 × 1 vale 15 pontos; 3 × 2 vale 25 pontos."],
  ["Placar exato de 0 × 0", "10 pontos", "Exceção convencional, sem multiplicador por gols."],
  ["Vencedor + diferença exata", "4 pontos", "Acerta o vencedor e a diferença de gols, mas não o placar."],
  ["Empate correto", "4 pontos", "Acerta que a partida termina empatada, mas erra o placar exato."],
  ["Somente o vencedor", "3 pontos", "Acerta o vencedor, mas não o placar nem a diferença de gols."],
];

const bonuses = [
  ["Time Carisma", "Dobra a pontuação básica", "O multiplicador incide apenas sobre a pontuação básica do palpite."],
  ["Acerto sozinho total", "+30 pontos", "Único participante — humano ou bot — a pontuar e, ao mesmo tempo, único participante a acertar o placar exato."],
  ["Acerto sozinho parcial", "+15 pontos", "Único participante — humano ou bot — a pontuar sem placar exato, ou único participante no placar exato quando outros também pontuam."],
];

const bots = [
  ["OddMestre", "Seleciona o placar considerado mais provável pelas odds capturadas 24 horas antes do jogo."],
  ["Maria Vai com as Outras", "Calcula a média dos palpites humanos e arredonda valores terminados em 0,5 para cima."],
  ["Faria Limmer", "Transforma PIB per capita PPP e IDH em um índice socioeconômico, convertido em gols."],
  ["Pangaré", "Usa uma distribuição caótica, porém reproduzível e inspirada no histórico das Copas."],
];

export default function RegulamentoPage() {
  return <div className="shell"><NavBar/><main className="container regulation-page">
    <section className="regulation-hero snickers-hero"><div><div className="eyebrow yellow-eyebrow">Regulamento executivo atualizado</div><h1>Mundial Snickers<br/>do Carisma 2026</h1><p>16 participantes, grupos próprios, confrontos diretos, sorteios ao vivo, quatro bots explicáveis e uma pontuação que premia precisão, ousadia e exclusividade.</p><div className="actions"><a className="button button-yellow" href="/regulamento-oficial-super-bolao-2026.pdf" target="_blank" rel="noreferrer">Abrir PDF histórico da versão anterior</a></div></div><div className="sponsor-card regulation-sponsor"><div className="chocolate-bar"><i/><b>SNICKERS</b><small>DO CARISMA</small></div><p>Patrocínio fictício. Rivalidade real.</p></div></section>

    <section className="executive-summary"><div className="eyebrow">Em uma frase</div><p>Uma Copa dentro da Copa: os participantes disputam grupos próprios, somam pontos nos confrontos diretos e usam uma pontuação de alto impacto, com placares exatos multiplicados pelos gols e bônus de exclusividade válidos para humanos e bots.</p></section>

    <section className="card regulation-section scoring-regulation-section">
      <div className="section-head"><div><div className="eyebrow">Pontuação básica</div><h2>Quanto vale cada tipo de acerto</h2></div></div>
      <div className="scoring-rule-grid">{baseScoring.map(([title, points, text]) => <article key={title}><span>{points}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      <div className="scoring-example-banner"><strong>Exemplo de alto impacto</strong><span>Palpite 4 × 2 em resultado 4 × 2: 6 gols × 5 = <b>30 pontos básicos</b>. Com Time Carisma, total básico de <b>60 pontos</b>.</span></div>
    </section>

    <section className="card regulation-section bonus-regulation-section">
      <div className="section-head"><div><div className="eyebrow">Bônus</div><h2>Carisma e acertos exclusivos</h2></div></div>
      <div className="bonus-rule-grid">{bonuses.map(([title, points, text]) => <article key={title}><div><strong>{title}</strong><span>{points}</span></div><p>{text}</p></article>)}</div>
      <div className="regulation-callout"><strong>Importante</strong><p>Os bônus de +30 e +15 são apurados entre todos os 16 participantes. Humanos e bots contam na verificação de exclusividade e podem receber os bônus. O Time Carisma dobra somente a pontuação básica: os bônus de exclusividade não são multiplicados.</p></div>
    </section>

    <section className="rules-grid">{competitionRules.map((rule)=><article className="rule-card" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}</section>

    <section className="card regulation-section"><div className="section-head"><div><div className="eyebrow">Participantes especiais</div><h2>Quatro bots, quatro personalidades</h2></div></div><div className="bot-rule-grid">{bots.map(([name,text])=><article key={name}><strong>{name}</strong><p>{text}</p></article>)}</div><p className="muted">Todo palpite de bot possui memória de cálculo pública, liberada após o fechamento, com dados de entrada, fonte, fórmula e eventual intervenção administrativa.</p></section>

    <section className="regulation-flow"><div><span>1</span><strong>Sorteios</strong><small>Grupos e Carisma</small></div><b>→</b><div><span>2</span><strong>Fase de grupos</strong><small>3 rodadas e confrontos</small></div><b>→</b><div><span>3</span><strong>Dois byes</strong><small>Melhores líderes</small></div><b>→</b><div><span>4</span><strong>Mata-mata</strong><small>Pedreiros e Pangas</small></div></section>

    <section className="card"><h3>Versão vigente no site</h3><p className="muted">A pontuação descrita nesta página é a regra vigente no sistema. O PDF disponível acima permanece como documento histórico da versão anterior e deverá ser substituído quando o regulamento formal completo for consolidado.</p></section>
  </main></div>;
}
