"use client";

import { useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type Guess = { slot: number; homeScore: number; awayScore: number; source?: string };
type ResultComponent = { code: string; label: string; points: number };
type ResultRow = {
  participantId: string;
  displayName: string;
  participantType: "HUMAN" | "BOT";
  guesses: Guess[];
  selectedSlot: number | null;
  totalPoints: number;
  baseCode: string | null;
  baseLabel: string;
  components: ResultComponent[];
  position: number;
};
type ResultMatch = {
  matchId: string;
  matchNumber: number;
  phase: string;
  phaseLabel: string;
  group?: string | null;
  groupRound?: number | null;
  kickoffAt: string | null;
  venue?: string | null;
  status: string;
  scoringStatus: string;
  isLive: boolean;
  isProvisional: boolean;
  isConfirmed: boolean;
  livePeriod?: string | null;
  liveMinute?: number | null;
  updatedAt?: string | null;
  resultSource?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  rows: ResultRow[];
};

type Tab = "LIVE" | "FINISHED" | "ALL";

function formatDate(value: string | null) {
  if (!value) return "Data não disponível";
  return new Date(value).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function periodLabel(match: ResultMatch) {
  if (match.status === "HALFTIME") return "Intervalo";
  if (match.status === "EXTRA_TIME") return match.livePeriod === "PEN" ? "Pênaltis" : "Prorrogação";
  if (match.isLive) return match.liveMinute != null ? `${match.liveMinute}'` : "Ao vivo";
  if (match.isProvisional) return "Final provisório";
  if (match.status === "VOID") return "Anulado";
  return "Resultado confirmado";
}

function guessLabel(row: ResultRow) {
  if (!row.guesses.length) return "—";
  return row.guesses.map((guess) => `${guess.homeScore} × ${guess.awayScore}`).join(" / ");
}

export default function ResultsClient() {
  const [matches, setMatches] = useState<ResultMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("LIVE");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/results", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar resultados");
      const nextMatches = data.matches as ResultMatch[];
      setMatches(nextMatches);
      setUpdatedAt(data.updatedAt ?? null);
      setSelectedId((current) => current && nextMatches.some((match) => match.matchId === current)
        ? current
        : nextMatches.find((match) => match.isLive)?.matchId ?? nextMatches[0]?.matchId ?? null);
      if (!nextMatches.some((match) => match.isLive) && tab === "LIVE") setTab("FINISHED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar resultados");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const interval = setInterval(() => { void load(true); }, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phases = useMemo(() => Array.from(new Set(matches.map((match) => match.phase))).filter(Boolean), [matches]);
  const groups = useMemo(() => Array.from(new Set(matches.map((match) => match.group).filter((value): value is string => Boolean(value)))).sort(), [matches]);
  const tabMatches = useMemo(() => matches.filter((match) => {
    if (tab === "LIVE" && !match.isLive && !match.isProvisional) return false;
    if (tab === "FINISHED" && !match.isConfirmed && match.status !== "VOID") return false;
    if (phaseFilter !== "ALL" && match.phase !== phaseFilter) return false;
    if (groupFilter !== "ALL" && match.group !== groupFilter) return false;
    return true;
  }), [matches, tab, phaseFilter, groupFilter]);

  const selected = tabMatches.find((match) => match.matchId === selectedId) ?? tabMatches[0] ?? null;
  const liveCount = matches.filter((match) => match.isLive).length;

  if (loading) return <section className="card">Carregando resultados…</section>;
  if (error) return <section className="error">{error}</section>;

  return <div className="results-page-shell">
    <section className="results-tabs-card">
      <div className="results-tabs">
        <button type="button" className={tab === "LIVE" ? "active" : ""} onClick={() => setTab("LIVE")}>Ao vivo {liveCount ? <span>{liveCount}</span> : null}</button>
        <button type="button" className={tab === "FINISHED" ? "active" : ""} onClick={() => setTab("FINISHED")}>Encerrados</button>
        <button type="button" className={tab === "ALL" ? "active" : ""} onClick={() => setTab("ALL")}>Por partida</button>
      </div>
      <div className="results-refresh"><span>{updatedAt ? `Atualizado às ${new Date(updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span><button type="button" className="button button-small" onClick={() => load()}>Atualizar</button></div>
    </section>

    <section className="filter-panel results-filter-panel">
      <label>Fase<select className="input" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}><option value="ALL">Todas</option>{phases.map((phase) => <option key={phase} value={phase}>{matches.find((match) => match.phase === phase)?.phaseLabel ?? phase}</option>)}</select></label>
      <label>Grupo<select className="input" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="ALL">Todos</option>{groups.map((group) => <option key={group} value={group}>Grupo {group}</option>)}</select></label>
    </section>

    {!tabMatches.length ? <section className="card results-empty"><span>{tab === "LIVE" ? "⚽" : "📊"}</span><h3>{tab === "LIVE" ? "Nenhum jogo ao vivo agora" : "Nenhum resultado disponível"}</h3><p className="muted">Quando o administrador atualizar ou confirmar uma partida, ela aparecerá aqui automaticamente.</p></section> : <div className="results-layout">
      <aside className="card results-match-picker">
        <div className="eyebrow">Partidas</div>
        <div className="results-match-list">{tabMatches.map((match) => <button key={match.matchId} type="button" className={`results-match-option ${selected?.matchId === match.matchId ? "active" : ""}`} onClick={() => setSelectedId(match.matchId)}>
          <div><small>Jogo {match.matchNumber} · {match.phaseLabel}</small><strong><CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName} />{match.homeTeamName}<i>{match.homeScore ?? "–"} × {match.awayScore ?? "–"}</i>{match.awayTeamName}<CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName} /></strong></div>
          <span className={match.isLive ? "live-dot-label" : match.isProvisional ? "provisional-label" : "confirmed-label"}>{periodLabel(match)}</span>
        </button>)}</div>
      </aside>

      {selected ? <div className="results-detail-column">
        <section className={`results-score-card ${selected.isLive ? "live-result" : ""} ${selected.status === "VOID" ? "void-result" : ""}`}>
          <div className="results-score-meta"><div><span>Jogo {selected.matchNumber}</span><strong>{selected.phaseLabel}</strong></div><time>{formatDate(selected.kickoffAt)}</time></div>
          <div className="results-live-status"><span className={selected.isLive ? "live-pulse" : ""}>{periodLabel(selected)}</span>{selected.isProvisional ? <small>A pontuação abaixo ainda é provisória.</small> : selected.isLive ? <small>Os pontos mudam a cada gol.</small> : null}</div>
          <div className="results-scoreboard">
            <div className="results-team results-team-home"><CountryFlag iso2={selected.homeTeamIso2} name={selected.homeTeamName} className="results-flag" /><strong>{selected.homeTeamName}</strong></div>
            <div className="results-official-score">{selected.status === "VOID" ? <span>ANULADO</span> : <><b>{selected.homeScore ?? "–"}</b><i>×</i><b>{selected.awayScore ?? "–"}</b></>}<small>{selected.isLive ? "Placar atual" : selected.isProvisional ? "Resultado provisório" : "Placar oficial do bolão"}</small></div>
            <div className="results-team results-team-away"><strong>{selected.awayTeamName}</strong><CountryFlag iso2={selected.awayTeamIso2} name={selected.awayTeamName} className="results-flag" /></div>
          </div>
          {selected.venue ? <div className="results-venue">📍 {selected.venue}</div> : null}
        </section>

        <section className="card results-ranking-card">
          <div className="results-ranking-head"><div><div className="eyebrow">{selected.isConfirmed ? "Pontuação oficial" : "Pontuação provisória"}</div><h3>Como cada participante está indo</h3></div><span className="badge badge-gold">{selected.rows.length} participantes</span></div>
          <div className="table-wrap"><table className="results-table"><thead><tr><th>#</th><th>Participante</th><th>Palpite</th><th>Critério</th><th>Pontos</th></tr></thead><tbody>{selected.rows.map((row) => <tr key={row.participantId} className={row.totalPoints === selected.rows[0]?.totalPoints && row.totalPoints > 0 ? "match-leader-row" : ""}>
            <td><strong>{row.position}º</strong></td>
            <td><span className="results-participant"><strong>{row.displayName}</strong>{row.participantType === "BOT" ? <small className="badge badge-gold">Bot</small> : <small>Humano</small>}</span></td>
            <td><span className="results-guess">{guessLabel(row)}</span>{row.guesses.length > 1 && row.selectedSlot ? <small className="results-best-slot">Valeu o palpite {row.selectedSlot}</small> : null}</td>
            <td><span className="results-criterion"><strong>{row.baseLabel}</strong>{row.components.length > 1 ? <small>{row.components.slice(1).map((component) => `${component.label}: ${component.points >= 0 ? "+" : ""}${component.points}`).join(" · ")}</small> : null}</span></td>
            <td><strong className="results-points">{row.totalPoints}</strong></td>
          </tr>)}</tbody></table></div>
        </section>
      </div> : null}
    </div>}
  </div>;
}
