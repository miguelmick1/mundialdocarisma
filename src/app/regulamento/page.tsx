import NavBar from "@/components/NavBar";

const competitionRules = [
  { number: "01", title: "Quatro grupos de quatro", text: "Os 12 participantes humanos e os quatro bots são sorteados em quatro grupos. Cada grupo recebe um bot e três humanos." },
  { number: "02", title: "Três confrontos diretos", text: "A cada rodada da fase de grupos, cada participante enfrenta um adversário. Vitória vale 3 pontos, empate vale 1 e derrota vale 0." },
  { number: "03", title: "Pontos feitos como desempate", text: "A classificação do grupo considera primeiro os pontos dos confrontos; depois, pontos feitos, saldo de pontos, placares exatos e sorteio oficial." },
  { number: "04", title: "Dois líderes com bye", text: "Ao fim da fase de grupos, os dois melhores líderes descansam nos 16-avos. A composição final das chaves Pedreiros e Pangas será consolidada conforme a estrutura oficial da competição." },
  { number: "05", title: "Um Time Carisma nas três rodadas", text: "Cada participante recebe três opções, uma de cada pote, e escolhe uma delas. A mesma seleção vale nas três rodadas da fase de grupos e fica bloqueada quando começa seu primeiro jogo. No mata-mata, as seleções ainda vivas ficam liberadas para todos." },
  { number: "06", title: "Sorteio público e auditável", text: "Grupos e Times Carisma são revelados bolinha por bolinha. O administrador conduz o ritmo, e todos os usuários conectados acompanham a mesma sequência." },
];

const basicScoring = [
  ["Placar exato", "5 pontos multiplicados pelo total de gols da partida. Exemplo: acertar 2 × 1 vale 15 pontos."],
  ["Placar exato de 0 × 0", "Por convenção, vale 10 pontos, sem aplicação do multiplicador por gols."],
  ["Vencedor e diferença de gols", "4 pontos quando o vencedor e a diferença de gols estão corretos, mas o placar exato não."],
  ["Empate sem placar exato", "4 pontos quando o empate é previsto corretamente, mas com outro placar."],
  ["Somente o vencedor", "3 pontos quando o vencedor está correto, mas não o placar nem a diferença de gols."],
];

const bonuses = [
  ["Time Carisma", "Dobra somente a pontuação básica nas partidas da seleção escolhida. Na fase de grupos, a mesma escolha vale nas três rodadas e fica bloqueada no início do primeiro jogo da seleção. Os bônus de acerto sozinho não são dobrados."],
  ["Acerto sozinho total: +30", "Um participante humano recebe 30 pontos quando é, simultaneamente, o único humano a pontuar e o único humano a acertar o placar exato daquela partida."],
  ["Acerto sozinho parcial: +15", "Um participante humano recebe 15 pontos quando é o único humano a pontuar sem acertar o placar exato, ou quando é o único humano a acertar o placar exato sem ser o único humano a pontuar."],
  ["Bots fora da exclusividade", "Os palpites dos bots recebem a pontuação básica aplicável, mas não contam para definir exclusividade e não recebem bônus de acerto sozinho."],
];

const bots = [
  ["Betinho Everyday", "Seleciona o placar considerado mais provável pelas odds capturadas 24 horas antes do jogo."],
  ["Maria Vai com as Outras", "Calcula a média dos palpites humanos e arredonda valores terminados em 0,5 para cima."],
  ["Faria Limmer", "Transforma PIB per capita PPP e IDH em um índice socioeconômico, convertido em gols."],
  ["Pangaré", "Usa uma distribuição caótica, porém reproduzível e inspirada no histórico das Copas."],
];

export default function RegulamentoPage() {
  return <div className="shell"><NavBar/><main className="container regulation-page">
    <section className="regulation-hero snickers-hero">
      <div>
        <div className="eyebrow yellow-eyebrow">Regulamento oficial</div>
        <h1>Mundial Snickers<br/>do Carisma 2026</h1>
        <p>16 participantes, confrontos diretos, quatro bots explicáveis, Time Carisma e uma regra de pontuação que valoriza placares exatos e acertos realmente exclusivos.</p>
      </div>
      <div className="regulation-score" aria-label="Resumo da pontuação">
        <span>5×</span><small>gols no placar exato</small>
        <span>+30</span><small>sozinho total</small>
        <span>2×</span><small>pontuação básica do Carisma</small>
      </div>
    </section>

    <section className="executive-summary">
      <div className="eyebrow">Em uma frase</div>
      <p>Acertar o placar pode render muitos pontos; ser o único humano a fazê-lo pode render ainda mais.</p>
    </section>

    <section className="card regulation-section">
      <div className="section-head"><div><div className="eyebrow">Pontuação básica</div><h2>Como cada palpite pontua</h2></div></div>
      <div className="scoring-rule-grid">
        {basicScoring.map(([title, text], index) => <article key={title} className={index < 2 ? "highlight" : ""}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></article>)}
      </div>
      <p className="regulation-footnote">A pontuação é calculada pelo placar oficial considerado pelo bolão, conforme o encerramento regulamentar da partida cadastrado pelo administrador.</p>
    </section>

    <section className="card regulation-section">
      <div className="section-head"><div><div className="eyebrow">Bônus</div><h2>Carisma e acertos exclusivos</h2></div></div>
      <div className="bonus-rule-grid">
        {bonuses.map(([title, text]) => <article key={title}><strong>{title}</strong><p>{text}</p></article>)}
      </div>
      <div className="bonus-example">
        <strong>Exemplo combinado</strong>
        <p>Um participante acerta sozinho 2 × 1 em um jogo do seu Time Carisma: faz 15 pontos básicos, que dobram para 30, e recebe mais 30 pelo acerto sozinho total. Total: <b>60 pontos</b>.</p>
      </div>
    </section>

    <section className="rules-grid">
      {competitionRules.map((rule)=><article className="rule-card" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}
    </section>

    <section className="card regulation-section">
      <div className="section-head"><div><div className="eyebrow">Participantes especiais</div><h2>Quatro bots, quatro personalidades</h2></div></div>
      <div className="bot-rule-grid">{bots.map(([name,text])=><article key={name}><strong>{name}</strong><p>{text}</p></article>)}</div>
      <p className="muted">Todo palpite de bot possui memória de cálculo pública, liberada após o fechamento, com dados de entrada, fonte, fórmula e eventual intervenção administrativa.</p>
    </section>

    <section className="regulation-flow"><div><span>1</span><strong>Sorteios</strong><small>Grupos e Carisma</small></div><b>→</b><div><span>2</span><strong>Fase de grupos</strong><small>3 rodadas e confrontos</small></div><b>→</b><div><span>3</span><strong>Dois byes</strong><small>Melhores líderes</small></div><b>→</b><div><span>4</span><strong>Mata-mata</strong><small>Pedreiros e Pangas</small></div></section>
  </main></div>;
}
