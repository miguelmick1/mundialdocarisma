import NavBar from "@/components/NavBar";

const rules = [
  { number: "01", title: "Duas competições, um único palpite", text: "Os mesmos palpites alimentam simultaneamente o campeonato de pontos corridos e o mata-mata de dupla eliminação entre Pedreiros e Pangas." },
  { number: "02", title: "Pontuação objetiva", text: "Placar exato vale 5 pontos; vencedor e saldo exato valem 4; vencedor ou empate correto, com placar diferente, vale 3." },
  { number: "03", title: "Fechamento no início do jogo", text: "Cada palpite fica aberto até o minuto exato do início da partida, sempre pelo relógio do servidor. Depois disso, a edição é bloqueada." },
  { number: "04", title: "Time Carisma", text: "A cada rodada do mata-mata, cada participante escolhe uma seleção ainda viva e que ainda não tenha entrado em campo. Os pontos do palpite são duplicados e há bônus real de +3 por vitória e +1 por empate." },
  { number: "05", title: "Resultado válido", text: "Nos jogos eliminatórios, vale o placar após até 120 minutos. Disputas por pênaltis não entram no placar considerado pelo bolão." },
  { number: "06", title: "Desempates transparentes", text: "Nos pontos corridos, o primeiro critério é o número de placares exatos. Empates que precisem definir avanço no mata-mata são resolvidos por sorteio oficial auditável." }
];

const bots = [
  ["OddMestre", "Seleciona o placar considerado mais provável pelas odds capturadas 24 horas antes do jogo."],
  ["Maria Vai Com as Outras", "Calcula a média dos palpites humanos e arredonda valores terminados em 0,5 para cima."],
  ["Faria Limmer", "Transforma PIB per capita PPP e IDH em um índice socioeconômico, convertido em gols."],
  ["Pangaré", "Usa uma distribuição caótica, porém reproduzível e inspirada no histórico das Copas."]
];

export default function RegulamentoPage() {
  return <div className="shell"><NavBar/><main className="container regulation-page">
    <section className="regulation-hero">
      <div><div className="eyebrow yellow-eyebrow">Regulamento executivo</div><h1>Super Bolão<br/>Copa do Mundo 2026</h1><p>16 participantes, dois campeonatos paralelos, quatro bots explicáveis, Time Carisma e uma final com Wild Card.</p><div className="actions"><a className="button button-yellow" href="/regulamento-oficial-super-bolao-2026.pdf" target="_blank" rel="noreferrer">Abrir regulamento oficial em PDF</a></div></div>
      <div className="regulation-score"><span>5</span><small>placar exato</small><span>4</span><small>saldo exato</small><span>3</span><small>resultado correto</small></div>
    </section>

    <section className="executive-summary"><div className="eyebrow">Em uma frase</div><p>Uma disputa de regularidade e sobrevivência: todos acumulam pontos ao longo das 104 partidas, enquanto o mata-mata começa nos 16-avos da Copa e conduz os sobreviventes pelas chaves dos Pedreiros e Pangas.</p></section>

    <section className="rules-grid">{rules.map((rule) => <article className="rule-card" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}</section>

    <section className="card regulation-section"><div className="section-head"><div><div className="eyebrow">Participantes especiais</div><h2>Quatro bots, quatro personalidades</h2></div></div><div className="bot-rule-grid">{bots.map(([name, text]) => <article key={name}><strong>{name}</strong><p>{text}</p></article>)}</div><p className="muted">Todo palpite de bot possui memória de cálculo pública, liberada após o fechamento, com dados de entrada, fonte, fórmula e eventual intervenção administrativa.</p></section>

    <section className="regulation-flow"><div><span>1</span><strong>Pontos corridos</strong><small>Do jogo inaugural à final</small></div><b>→</b><div><span>2</span><strong>Pedreiros e Pangas</strong><small>Dupla eliminação</small></div><b>→</b><div><span>3</span><strong>Triangulares</strong><small>La Muerte e La Vida</small></div><b>→</b><div><span>4</span><strong>Grande Final</strong><small>Wild Card do invicto</small></div></section>

    <section className="card"><h3>Regras operacionais importantes</h3><ul className="professional-list"><li>Partidas adiadas, abandonadas ou anuladas recebem pontuação zero e permanecem disponíveis para auditoria.</li><li>A Wild Card permite dois placares ao finalista invicto; vale somente a melhor pontuação entre eles.</li><li>O administrador pode corrigir palpites de bots antes do início do jogo, sempre com justificativa e registro público.</li><li>As regras de confronto e as partidas que compõem cada etapa do mata-mata são configuráveis no módulo administrativo.</li></ul></section>
  </main></div>;
}
