"use client";

import { useEffect, useState, type CSSProperties } from "react";

type RoundOption = {
  id: string;
  label: string;
  matchCount: number;
  revealedCount: number;
  calculatedCount: number;
};

type SummaryCell = {
  guessText: string;
  points: number | null;
  basePoints: number | null;
  baseCode: string | null;
  revealed: boolean;
  resultCalculated: boolean;
  isVoid: boolean;
  isOnlyScorer: boolean;
  isOnlyExact: boolean;
  isOnlyZero: boolean;
  audacityScore: number | null;
};

type SummaryParticipant = {
  participantId: string;
  displayName: string;
  participantType: "HUMAN" | "BOT";
  cells: SummaryCell[];
};

type SummaryPayload = {
  rounds: RoundOption[];
  selectedRoundId: string;
  summary: {
    roundLabel: string;
    matches: Array<{
      id: string;
      matchNumber: number;
      phaseLabel: string;
      homeTeamName: string;
      awayTeamName: string;
      homeScore: number | null;
      awayScore: number | null;
      revealed: boolean;
      resultCalculated: boolean;
      isVoid: boolean;
    }>;
    participants: SummaryParticipant[];
  };
};

const EMPTY_STATE: SummaryPayload = {
  rounds: [],
  selectedRoundId: "GROUP_1",
  summary: {
    roundLabel: "",
    matches: [],
    participants: [],
  },
};

type CellPresentation = {
  className: string;
  detail: string;
  note: string;
  style?: CSSProperties;
};

type HeatmapStyle = CSSProperties & {
  "--round-summary-cell-bg": string;
  "--round-summary-cell-border": string;
  "--round-summary-cell-accent": string;
  "--round-summary-cell-strong": string;
};

function baseLabel(cell: SummaryCell) {
  if (!cell.resultCalculated) return "Sem apuracao";
  if (cell.isVoid) return "Anulado";

  switch (cell.baseCode) {
    case "BASE_EXACT_SCORE":
      return "Placar exato";
    case "BASE_GOAL_DIFFERENCE":
      return "Vencedor e diferenca";
    case "BASE_DRAW":
      return "Empate correto";
    case "BASE_OUTCOME":
      return "Vencedor correto";
    default:
      return "Nao pontuou";
  }
}

function noteForCell(cell: SummaryCell) {
  const bonus = Math.max(0, (cell.points ?? 0) - (cell.basePoints ?? 0));
  const notes: string[] = [];
  if (bonus > 0) notes.push(`Bonus ${bonus}`);
  if (cell.isOnlyExact) notes.push("Exato unico");
  else if (cell.isOnlyScorer) notes.push("Unico a pontuar");
  else if (cell.isOnlyZero) notes.push("Unico zerado");
  if (cell.audacityScore != null && cell.audacityScore >= 2.5) notes.push(`Ousadia ${cell.audacityScore.toFixed(1)}`);
  return notes[0] ?? baseLabel(cell);
}

function cssVars(background: string, border: string, accent: string, strong?: string): HeatmapStyle {
  return {
    "--round-summary-cell-bg": background,
    "--round-summary-cell-border": border,
    "--round-summary-cell-accent": accent,
    "--round-summary-cell-strong": strong ?? "#10213b",
  };
}

function cellPresentation(cell: SummaryCell): CellPresentation {
  if (!cell.revealed) {
    return {
      className: "locked",
      detail: "Protegido",
      note: "Palpite fechado",
    };
  }

  if (cell.isVoid) {
    return {
      className: "void",
      detail: "Anulado",
      note: "Partida anulada",
      style: cssVars(
        "linear-gradient(135deg,#f4f7fb,#e9eef6)",
        "#d4deea",
        "#7a8ca4",
      ),
    };
  }

  if (!cell.resultCalculated) {
    return {
      className: "revealed",
      detail: "Sem apuracao",
      note: "Aguardando calculo",
      style: cssVars(
        "linear-gradient(135deg,#fffbe7,#fff5c7)",
        "#f1d96b",
        "#d49b00",
      ),
    };
  }

  const points = cell.points ?? 0;
  if (points <= 0) {
    return {
      className: "settled heat-miss",
      detail: "0 pts",
      note: noteForCell(cell),
      style: cssVars(
        "linear-gradient(135deg,#fff3f1,#ffd9d2)",
        "#ff9f93",
        "#d94b3d",
      ),
    };
  }

  if (cell.baseCode === "BASE_OUTCOME") {
    return {
      className: "settled heat-outcome",
      detail: `${points} pts`,
      note: noteForCell(cell),
      style: cssVars(
        "linear-gradient(135deg,#fff7df,#ffe8a6)",
        "#f0c451",
        "#c98900",
      ),
    };
  }

  if (cell.baseCode === "BASE_DRAW" || cell.baseCode === "BASE_GOAL_DIFFERENCE") {
    return {
      className: "settled heat-solid",
      detail: `${points} pts`,
      note: noteForCell(cell),
      style: cssVars(
        "linear-gradient(135deg,#eef9f0,#cbeed2)",
        "#67b879",
        "#1b7f43",
      ),
    };
  }

  const exactIntensity = Math.min(Math.max(points, 10), 30);
  const alpha = 0.18 + ((exactIntensity - 10) / 20) * 0.34;

  return {
    className: "settled heat-exact",
    detail: `${points} pts`,
    note: noteForCell(cell),
    style: cssVars(
      `linear-gradient(135deg,rgba(10,108,61,${alpha.toFixed(2)}),rgba(4,78,45,${(alpha + 0.16).toFixed(2)}))`,
      "#0f8a4e",
      "#0a6c3d",
      "#082515",
    ),
  };
}

export default function RoundSummaryClient() {
  const [payload, setPayload] = useState<SummaryPayload>(EMPTY_STATE);
  const [roundId, setRoundId] = useState("GROUP_1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextRoundId?: string) {
    setLoading(true);
    setError("");
    try {
      const target = nextRoundId ?? roundId;
      const response = await fetch(`/api/round-summary?roundId=${encodeURIComponent(target)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar resumo");
      setPayload(data);
      setRoundId(data.selectedRoundId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar resumo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("GROUP_1");
  }, []);

  if (loading) return <section className="card">Carregando o resumo da rodada...</section>;
  if (error) return <section className="error">{error}</section>;

  return <div className="round-summary-shell">
    <section className="card round-summary-topbar">
      <div>
        <div className="eyebrow">Leitura panoramica</div>
        <h3>Resumo da rodada</h3>
        <p className="muted">Compare varios jogos ao mesmo tempo e veja rapido quem pontuou, quem errou e quem ainda esta protegido pela trava de inicio.</p>
      </div>
      <div className="round-summary-controls">
        <label>
          Rodada
          <select className="input" value={roundId} onChange={(event) => void load(event.target.value)}>
            {payload.rounds.map((round) => <option key={round.id} value={round.id}>{round.label}</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary compact-button" onClick={() => void load(roundId)}>Atualizar</button>
      </div>
    </section>

    <section className="card round-summary-metrics">
      <span><strong>{payload.summary.matches.length}</strong> jogos no recorte</span>
      <span><strong>{payload.summary.matches.filter((match) => match.revealed).length}</strong> palpites liberados</span>
      <span><strong>{payload.summary.matches.filter((match) => match.resultCalculated).length}</strong> partidas apuradas</span>
    </section>

    <section className="card round-summary-table-card">
      <div className="round-summary-head">
        <div>
          <div className="eyebrow">Matriz da rodada</div>
          <h3>{payload.summary.roundLabel}</h3>
        </div>
        <div className="round-summary-legend" aria-label="Legenda do mapa de calor">
          <span className="locked">Protegido</span>
          <span className="revealed">Liberado</span>
          <span className="heat-miss">Errou</span>
          <span className="heat-outcome">Vencedor</span>
          <span className="heat-solid">Empate/dif.</span>
          <span className="heat-exact">Exato/bonus</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="round-summary-table">
          <thead>
            <tr>
              <th>Participante</th>
              {payload.summary.matches.map((match) => <th key={match.id}>
                <div className="round-summary-match-head">
                  <small>Jogo {match.matchNumber}</small>
                  <strong>{match.homeTeamName}</strong>
                  <b>{match.homeScore != null && match.awayScore != null ? `${match.homeScore} x ${match.awayScore}` : "x"}</b>
                  <strong>{match.awayTeamName}</strong>
                  <span>{match.phaseLabel}</span>
                </div>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {payload.summary.participants.map((participant) => <tr key={participant.participantId}>
              <td className="round-summary-participant-cell">
                <strong>{participant.displayName}</strong>
                <small>{participant.participantType === "BOT" ? "Bot" : "Humano"}</small>
              </td>
              {participant.cells.map((cell, index) => {
                const presentation = cellPresentation(cell);
                return <td
                  key={`${participant.participantId}-${payload.summary.matches[index]?.id}`}
                  className={`round-summary-cell ${presentation.className}`}
                  style={presentation.style}
                >
                  {!cell.revealed ? <span className="round-summary-lock">Protegido</span> : <>
                    <strong>{cell.guessText}</strong>
                    <small>{presentation.detail}</small>
                    <em>{presentation.note}</em>
                  </>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
