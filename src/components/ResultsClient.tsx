"use client";

import { useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type GuessRow = {
  slot: number;
  homeScore: number;
  awayScore: number;
  source?: string;
};

type ResultParticipant = {
  participantId: string;
  displayName: string;
  participantType: "HUMAN" | "BOT";
  guesses: GuessRow[];
  selectedSlot: number | null;
  totalPoints: number;
  baseCode: string | null;
  baseLabel: string;
  components: Array<{ code: string; label: string; points: number }>;
  position: number;
};

type MatchResult = {
  matchId: string;
  matchNumber: number;
  phase: string;
  phaseLabel: string;
  group?: string | null;
  groupRound?: number | null;
  kickoffAt: string | null;
  venue?: string | null;
  status: "FINISHED" | "VOID";
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  rows: ResultParticipant[];
};

type Payload = { matches: MatchResult[]; updatedAt: string; error?: string };

function guessLabel(row: ResultParticipant) {
  if (!row.guesses.length) return "Sem palpite";
  return row.guesses.map((guess) => `${guess.homeScore} × ${guess.awayScore}`).join(" / ");
}

function formatDate(value: string | null) {
  if (!value) return "Data a definir";
  return new Date(value).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ResultsClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [selectedMatchId, setSelectedMatchId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/results", { cache: "no-store" });
      const data = await response.json() as Payload;
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar resultados");
      setPayload(data);
      if (!selectedMatchId && data.matches.length) setSelectedMatchId(data.matches[0]!.matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar resultados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const phases = useMemo(
    () => Array.from(new Set((payload?.matches ?? []).map((match) => match.phase))).filter(Boolean),
    [payload]
  );
  const groups = useMemo(
    () => Array.from(new Set((payload?.matches ?? []).map((match) => match.group).filter((value): value is string => Boolean(value)))).sort(),
    [payload]
  );
  const filteredMatches = useMemo(() => (payload?.matches ?? []).filter((match) => {
    if (phaseFilter !== "ALL" && match.phase !== phaseFilter) return false;
    if (groupFilter !== "ALL" && match.group !== groupFilter) return false;
    return true;
  }), [payload, phaseFilter, groupFilter]);

  useEffect(() => {
    if (!filteredMatches.length) {
      setSelectedMatchId("");
      return;
    }
    if (!filteredMatches.some((match) => match.matchId === selectedMatchId)) {
      setSelectedMatchId(filteredMatches[0]!.matchId);
    }
  }, [filteredMatches, selectedMatchId]);

  const selected = filteredMatches.find((match) => match.matchId === selectedMatchId) ?? null;

  if (loading) return <section className="card">Carregando resultados…</section>;
  if (error) return <p className="error">{error}</p>;
  if (!payload?.matches.length) return <section className="card results-empty"><h3>Nenhum resultado disponível</h3><p className="muted">Os jogos aparecerão aqui depois que o administrador confirmar o placar e calcular a pontuação.</p></section>;

  return (
    <div className="results-page">
      <section className="card results-filter-card">
        <label>Fase
          <select className="input" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
            <option value="ALL">Todas</option>
            {phases.map((phase) => {
              const example = payload.matches.find((match) => match.phase === phase);
              return <option key={phase} value={phase}>{example?.phaseLabel ?? phase}</option>;
            })}
          </select>
        </label>
        <label>Grupo
          <select className="input" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="ALL">Todos</option>
            {groups.map((group) => <option key={group} value={group}>Grupo {group}</option>)}
          </select>
        </label>
        <label className="results-match-select">Partida
          <select className="input" value={selectedMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>
            {filteredMatches.map((match) => <option key={match.matchId} value={match.matchId}>Jogo {match.matchNumber} · {match.homeTeamName} × {match.awayTeamName}</option>)}
          </select>
        </label>
        <button className="button button-secondary compact-button" type="button" onClick={() => void load()}>Atualizar</button>
      </section>

      {selected ? <>
        <section className={`results-score-card ${selected.status === "VOID" ? "void-result" : ""}`}>
          <div className="results-score-meta">
            <div><span>Jogo {selected.matchNumber}</span><strong>{selected.phaseLabel}</strong></div>
            <time>{formatDate(selected.kickoffAt)}</time>
          </div>
          <div className="results-scoreboard">
            <div className="results-team results-team-home"><CountryFlag iso2={selected.homeTeamIso2} name={selected.homeTeamName} className="results-flag"/><strong>{selected.homeTeamName}</strong></div>
            <div className="results-official-score">
              {selected.status === "VOID" ? <span>ANULADO</span> : <><b>{selected.homeScore ?? "–"}</b><i>×</i><b>{selected.awayScore ?? "–"}</b></>}
              <small>{selected.status === "VOID" ? "Pontuação zerada" : "Placar oficial para o bolão"}</small>
            </div>
            <div className="results-team results-team-away"><strong>{selected.awayTeamName}</strong><CountryFlag iso2={selected.awayTeamIso2} name={selected.awayTeamName} className="results-flag"/></div>
          </div>
          {selected.venue ? <div className="results-venue">📍 {selected.venue}</div> : null}
        </section>

        <section className="card results-ranking-card">
          <div className="results-ranking-head"><div><div className="eyebrow">Pontuação da partida</div><h3>Como cada participante foi</h3></div><span className="badge badge-gold">{selected.rows.length} participantes</span></div>
          <div className="table-wrap">
            <table className="results-table">
              <thead><tr><th>#</th><th>Participante</th><th>Palpite</th><th>Critério</th><th>Pontos</th></tr></thead>
              <tbody>{selected.rows.map((row) => (
                <tr key={row.participantId} className={row.totalPoints === selected.rows[0]?.totalPoints && row.totalPoints > 0 ? "match-leader-row" : ""}>
                  <td><strong>{row.position}º</strong></td>
                  <td><span className="results-participant"><strong>{row.displayName}</strong>{row.participantType === "BOT" ? <small className="badge badge-gold">Bot</small> : <small>Humano</small>}</span></td>
                  <td><span className="results-guess">{guessLabel(row)}</span>{row.guesses.length > 1 && row.selectedSlot ? <small className="results-best-slot">Valeu o palpite {row.selectedSlot}</small> : null}</td>
                  <td><span className="results-criterion"><strong>{row.baseLabel}</strong>{row.components.length > 1 ? <small>{row.components.slice(1).map((component) => `${component.label}: ${component.points >= 0 ? "+" : ""}${component.points}`).join(" · ")}</small> : null}</span></td>
                  <td><strong className="results-points">{row.totalPoints}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </> : <section className="card results-empty">Nenhum jogo encontrado para esses filtros.</section>}
    </div>
  );
}
