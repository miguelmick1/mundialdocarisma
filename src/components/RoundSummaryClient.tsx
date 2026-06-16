"use client";

import { useEffect, useState } from "react";

type RoundOption = {
  id: string;
  label: string;
  matchCount: number;
  revealedCount: number;
  calculatedCount: number;
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
    participants: Array<{
      participantId: string;
      displayName: string;
      participantType: "HUMAN" | "BOT";
      cells: Array<{
        guessText: string;
        points: number | null;
        revealed: boolean;
        resultCalculated: boolean;
        isVoid: boolean;
      }>;
    }>;
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
        <div className="eyebrow">Leitura panorâmica</div>
        <h3>Resumo da rodada</h3>
        <p className="muted">Compare vários jogos ao mesmo tempo e veja rapidamente quem pontuou, quem errou e quem ainda está protegido pela trava de início.</p>
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
              {participant.cells.map((cell, index) => <td key={`${participant.participantId}-${payload.summary.matches[index]?.id}`} className={!cell.revealed ? "locked" : cell.resultCalculated ? "settled" : "revealed"}>
                {!cell.revealed ? <span className="round-summary-lock">Protegido</span> : <>
                  <strong>{cell.guessText}</strong>
                  <small>{cell.isVoid ? "Anulado" : cell.resultCalculated ? `${cell.points ?? 0} pts` : "Sem apuração"}</small>
                </>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
