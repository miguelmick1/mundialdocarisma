"use client";

import { useState } from "react";

type Prediction = { home: number; away: number };
type HumanPrediction = {
  participantId: string | null;
  participantName: string;
  home: number;
  away: number;
};

type Source = {
  botName: string;
  botStrategy: string;
  sourceStatus: string;
  effectivePrediction: Prediction;
  match?: { homeTeamName: string; awayTeamName: string };
  publicExplanation: {
    title: string;
    summary: string;
    inputs: Record<string, unknown>;
    steps?: Array<{ order: number; label: string; value?: string | number; explanation: string }>;
  };
  override?: {
    originalPrediction?: Prediction | null;
    finalPrediction: Prediction;
    administratorDisplayName: string;
    reason: string;
    overriddenAt?: string | null;
  };
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function predictionValue(value: unknown, fallback: Prediction): Prediction {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  return { home: numberValue(row.home, fallback.home), away: numberValue(row.away, fallback.away) };
}

function humanPredictions(value: unknown): HumanPrediction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.participantName !== "string") return [];
    return [{
      participantId: typeof row.participantId === "string" ? row.participantId : null,
      participantName: row.participantName,
      home: numberValue(row.home),
      away: numberValue(row.away),
    }];
  });
}

function percentLabel(value: unknown, fallback: number) {
  const number = numberValue(value, fallback);
  return `${number}%`;
}

function MariaExplanation({ source }: { source: Source }) {
  const inputs = source.publicExplanation.inputs;
  const rows = humanPredictions(inputs.humanPredictions);
  const homeTeamName = typeof inputs.homeTeamName === "string" ? inputs.homeTeamName : source.match?.homeTeamName ?? "Mandante";
  const awayTeamName = typeof inputs.awayTeamName === "string" ? inputs.awayTeamName : source.match?.awayTeamName ?? "Visitante";
  const homeAverage = numberValue(inputs.homeAverage);
  const awayAverage = numberValue(inputs.awayAverage);
  const finalPrediction = predictionValue(inputs.roundedPrediction, source.effectivePrediction);
  const homeTotal = rows.reduce((sum, row) => sum + row.home, 0);
  const awayTotal = rows.reduce((sum, row) => sum + row.away, 0);
  const count = rows.length;
  const averageLabel = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return <>
    <section className="bot-story-section">
      <h3>Palpites que entraram na média</h3>
      <p className="muted">Foi considerado apenas o palpite principal de cada participante humano ativo.</p>
      <div className="bot-human-guesses">
        {rows.map((row, index) => <div className="bot-human-guess-row" key={row.participantId ?? `${row.participantName}-${index}`}>
          <span>{row.participantName}</span>
          <strong>{row.home} × {row.away}</strong>
        </div>)}
        {!rows.length ? <p className="muted">Os palpites individuais não estavam disponíveis nesta memória antiga.</p> : null}
      </div>
    </section>

    <section className="bot-story-section">
      <h3>A média da turma</h3>
      <div className="bot-average-grid">
        <article>
          <span>{homeTeamName}</span>
          <strong>{averageLabel(homeAverage)}</strong>
          <small>{count ? `${homeTotal} gols somados ÷ ${count} palpites` : "Média registrada no momento do fechamento"}</small>
        </article>
        <article>
          <span>{awayTeamName}</span>
          <strong>{averageLabel(awayAverage)}</strong>
          <small>{count ? `${awayTotal} gols somados ÷ ${count} palpites` : "Média registrada no momento do fechamento"}</small>
        </article>
      </div>
      <div className="bot-rounding-row">
        <span>{averageLabel(homeAverage)} virou <strong>{finalPrediction.home}</strong></span>
        <span>{averageLabel(awayAverage)} virou <strong>{finalPrediction.away}</strong></span>
      </div>
    </section>

    <section className="bot-final-prediction">
      <div>
        <small>Depois do arredondamento</small>
        <strong>{homeTeamName} {finalPrediction.home} × {finalPrediction.away} {awayTeamName}</strong>
        <p>Cada média foi arredondada para o número inteiro mais próximo. Quando termina exatamente em 0,5, a Maria arredonda para cima.</p>
      </div>
    </section>
  </>;
}

function PangareExplanation({ source }: { source: Source }) {
  const inputs = source.publicExplanation.inputs;
  const homeTeamName = typeof inputs.homeTeamName === "string" ? inputs.homeTeamName : source.match?.homeTeamName ?? "Mandante";
  const awayTeamName = typeof inputs.awayTeamName === "string" ? inputs.awayTeamName : source.match?.awayTeamName ?? "Visitante";
  const favoriteTeamName = typeof inputs.favoriteTeamName === "string" ? inputs.favoriteTeamName : "Favorito";
  const underdogTeamName = typeof inputs.underdogTeamName === "string" ? inputs.underdogTeamName : "Azarão";
  const favoriteExplanation = typeof inputs.favoriteExplanation === "string" ? inputs.favoriteExplanation : `${favoriteTeamName} foi considerado o favorito.`;
  const selectedMode = typeof inputs.selectedMode === "string" ? inputs.selectedMode : "";
  const selectedModeLabel = typeof inputs.selectedModeLabel === "string" ? inputs.selectedModeLabel : "Modo Pangaré";
  const selectedModeExplanation = typeof inputs.selectedModeExplanation === "string" ? inputs.selectedModeExplanation : "O Pangaré escolheu um estilo para esta partida.";
  const probabilities = inputs.modeProbabilities && typeof inputs.modeProbabilities === "object"
    ? inputs.modeProbabilities as Record<string, unknown>
    : {};

  return <>
    <section className="bot-story-section">
      <h3>1. Quem era favorito?</h3>
      <div className="pangare-sides">
        <article className="favorite"><small>Favorito</small><strong>{favoriteTeamName}</strong></article>
        <article><small>Azarão</small><strong>{underdogTeamName}</strong></article>
      </div>
      <p className="bot-friendly-note">{favoriteExplanation}</p>
    </section>

    <section className="bot-story-section">
      <h3>2. Qual personalidade apareceu?</h3>
      <div className="pangare-mode-grid">
        {[
          { id: "UNDERDOG", label: "Zebra", chance: percentLabel(probabilities.UNDERDOG, 50), detail: "o azarão vence" },
          { id: "CHAOTIC_DRAW", label: "Empate caótico", chance: percentLabel(probabilities.CHAOTIC_DRAW, 30), detail: "empate com muitos gols" },
          { id: "GOAL_FEST", label: "Festival de gols", chance: percentLabel(probabilities.GOAL_FEST, 20), detail: "favorito vence com goleada" },
        ].map((mode) => <article key={mode.id} className={selectedMode === mode.id ? "selected" : ""}>
          <small>{mode.chance} de chance</small>
          <strong>{mode.label}</strong>
          <span>{mode.detail}</span>
          {selectedMode === mode.id ? <b>Foi este</b> : null}
        </article>)}
      </div>
      <p className="bot-friendly-note"><strong>{selectedModeLabel}:</strong> {selectedModeExplanation}</p>
    </section>

    <section className="bot-final-prediction">
      <div>
        <small>Palpite escolhido dentro desse modo</small>
        <strong>{homeTeamName} {source.effectivePrediction.home} × {source.effectivePrediction.away} {awayTeamName}</strong>
        <p>O sorteio do Pangaré é definido somente pela partida. Ele não consulta o placar ao vivo nem muda de ideia depois que o jogo começa.</p>
      </div>
    </section>
  </>;
}

function ManualExplanation({ source }: { source: Source }) {
  return <section className="bot-final-prediction manual">
    <div>
      <small>Palpite informado pelo administrador</small>
      <strong>{source.match?.homeTeamName ?? "Mandante"} {source.effectivePrediction.home} × {source.effectivePrediction.away} {source.match?.awayTeamName ?? "Visitante"}</strong>
      <p>{source.override?.reason ?? source.publicExplanation.summary}</p>
      {source.override?.administratorDisplayName ? <span>Registrado por {source.override.administratorDisplayName}</span> : null}
    </div>
  </section>;
}

export default function BotSourceDrawer({ guessId }: { guessId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");

  async function show() {
    setOpen(true);
    if (source) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/bot-sources/${encodeURIComponent(guessId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSource(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  const manualOnly = source?.sourceStatus === "ADMIN_OVERRIDE" && !source.override?.originalPrediction;

  return <>
    <button className="button button-secondary" onClick={show}>ⓘ Como este palpite foi feito?</button>
    {open ? <div className="drawer-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
      <section className="drawer bot-story-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="section-head bot-story-head" style={{ marginTop: 0 }}>
          <div><div className="eyebrow">Por trás do palpite</div><h2>{source?.publicExplanation.title ?? "Como este palpite foi feito"}</h2></div>
          <button className="button button-secondary" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        {loading ? <p>Carregando…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {source ? <>
          <p className="bot-story-summary">{source.publicExplanation.summary}</p>
          <div className="badge badge-gold">{source.botName}</div>
          {!manualOnly && source.botStrategy === "HUMAN_AVERAGE" ? <MariaExplanation source={source} /> : null}
          {!manualOnly && source.botStrategy === "PANGARE" ? <PangareExplanation source={source} /> : null}
          {manualOnly || !["HUMAN_AVERAGE", "PANGARE"].includes(source.botStrategy) ? <ManualExplanation source={source} /> : null}
          {!manualOnly && source.override && ["HUMAN_AVERAGE", "PANGARE"].includes(source.botStrategy) ? <div className="bot-override-note">
            <strong>O administrador ajustou o palpite</strong>
            <p>Palpite automático: {source.override.originalPrediction?.home ?? "—"} × {source.override.originalPrediction?.away ?? "—"}<br />Palpite usado: {source.override.finalPrediction.home} × {source.override.finalPrediction.away}</p>
            <span>{source.override.reason}</span>
          </div> : null}
        </> : null}
      </section>
    </div> : null}
  </>;
}
