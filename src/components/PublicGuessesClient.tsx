"use client";

import { useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type Guess = { guessId: string; slot: number; homeScore: number; awayScore: number };
type GuessRow = {
  participantId: string;
  displayName: string;
  participantType: "HUMAN" | "BOT";
  avatarUrl: string | null;
  guesses: Guess[];
  points: number | null;
  baseCode: string | null;
  carismaTeamId: string | null;
  isCarismaMatch: boolean;
};
type Match = {
  matchId: string;
  matchNumber: number;
  phase: string;
  phaseLabel: string;
  group?: string | null;
  groupRound?: number | null;
  kickoffAt: string | null;
  status: string;
  scoringStatus: string;
  resultCalculated: boolean;
  finalScore: { home: number; away: number } | null;
  venue?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  revealed: boolean;
  revealAt: string | null;
  rows: GuessRow[];
};

type RoundFilter = "ALL" | "GROUP_1" | "GROUP_2" | "GROUP_3" | "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "THIRD_PLACE" | "FINAL";
type VisibilityFilter = "ALL" | "REVEALED" | "UPCOMING";
type ParticipantFilter = "ALL" | "HUMAN" | "BOT";

const ROUND_FILTERS: Array<{ value: RoundFilter; label: string }> = [
  { value: "ALL", label: "Todas as rodadas" },
  { value: "GROUP_1", label: "Rodada 1" },
  { value: "GROUP_2", label: "Rodada 2" },
  { value: "GROUP_3", label: "Rodada 3" },
  { value: "ROUND_OF_32", label: "16-avos" },
  { value: "ROUND_OF_16", label: "Oitavas" },
  { value: "QUARTER_FINAL", label: "Quartas" },
  { value: "SEMI_FINAL", label: "Semifinais" },
  { value: "THIRD_PLACE", label: "3º lugar" },
  { value: "FINAL", label: "Final" },
];

function roundKey(match: Match): RoundFilter | string {
  if (match.phase === "GROUP_STAGE") return `GROUP_${match.groupRound ?? 0}`;
  return match.phase;
}

function formatKickoff(value: string | null) {
  if (!value) return "Horário a definir";
  return new Date(value).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function avatar(row: GuessRow) {
  if (row.avatarUrl) return <img className="public-guess-avatar" src={row.avatarUrl} alt="" />;
  return <span className={`public-guess-avatar fallback ${row.participantType === "BOT" ? "bot" : ""}`}>{row.participantType === "BOT" ? "🤖" : row.displayName.slice(0, 1).toUpperCase()}</span>;
}

function guessText(row: GuessRow) {
  if (!row.guesses.length) return "Sem palpite";
  return row.guesses.map((guess) => `${guess.homeScore} × ${guess.awayScore}`).join(" / ");
}

function pointsText(points: number | null) {
  if (points == null) return "—";
  return `${points} ${points === 1 ? "ponto" : "pontos"}`;
}

export default function PublicGuessesClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>("ALL");
  const [participantSearch, setParticipantSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public-guesses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar palpites");
      const next = data.matches as Match[];
      setMatches(next);
      setCurrentUserId(data.currentUserId ?? "");
      setSelectedId((current) => {
        if (current && next.some((match) => match.matchId === current)) return current;
        return [...next].reverse().find((match) => match.revealed)?.matchId ?? next[0]?.matchId ?? null;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar palpites");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => Array.from(new Set(matches.map((match) => match.group).filter((value): value is string => Boolean(value)))).sort(), [matches]);
  const filteredMatches = useMemo(() => matches.filter((match) => {
    if (roundFilter !== "ALL" && roundKey(match) !== roundFilter) return false;
    if (groupFilter !== "ALL" && match.group !== groupFilter) return false;
    if (visibilityFilter === "REVEALED" && !match.revealed) return false;
    if (visibilityFilter === "UPCOMING" && match.revealed) return false;
    return true;
  }), [matches, roundFilter, groupFilter, visibilityFilter]);

  const selected = filteredMatches.find((match) => match.matchId === selectedId) ?? filteredMatches[0] ?? null;
  const visibleRows = useMemo(() => {
    if (!selected?.revealed) return [];
    const query = participantSearch.trim().toLocaleLowerCase("pt-BR");
    return selected.rows.filter((row) => {
      if (participantFilter !== "ALL" && row.participantType !== participantFilter) return false;
      if (query && !row.displayName.toLocaleLowerCase("pt-BR").includes(query)) return false;
      return true;
    });
  }, [selected, participantFilter, participantSearch]);

  if (loading) return <section className="card">Carregando os palpites de todos…</section>;
  if (error) return <section className="error">{error}</section>;

  return <div className="public-guesses-shell">
    <section className="card public-guesses-intro">
      <div><div className="eyebrow">Transparência do bolão</div><h3>Palpites de todos por partida</h3><p>Os palpites são revelados automaticamente quando o jogo começa, preservando a disputa antes do fechamento.</p></div>
      <button type="button" className="button button-secondary compact-button" onClick={() => void load()}>Atualizar</button>
    </section>

    <section className="filter-panel public-guesses-filters">
      <label>Rodada<select className="input" value={roundFilter} onChange={(event) => setRoundFilter(event.target.value as RoundFilter)}>{ROUND_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Grupo<select className="input" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="ALL">Todos</option>{groups.map((group) => <option key={group} value={group}>Grupo {group}</option>)}</select></label>
      <label>Situação<select className="input" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}><option value="ALL">Todos os jogos</option><option value="REVEALED">Palpites liberados</option><option value="UPCOMING">Ainda protegidos</option></select></label>
    </section>

    {!filteredMatches.length ? <section className="card results-empty"><span>🔎</span><h3>Nenhum jogo neste filtro</h3><p className="muted">Altere rodada, grupo ou situação para consultar outras partidas.</p></section> : <div className="public-guesses-layout">
      <aside className="card public-guesses-match-picker">
        <div className="public-guesses-picker-head"><div><div className="eyebrow">Partidas</div><strong>{filteredMatches.length} jogos</strong></div></div>
        <div className="public-guesses-match-list">{filteredMatches.map((match) => <button key={match.matchId} type="button" className={`public-guesses-match-option ${selected?.matchId === match.matchId ? "active" : ""}`} onClick={() => setSelectedId(match.matchId)}>
          <small>Jogo {match.matchNumber} · {match.phaseLabel}</small>
          <strong><span><CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName}/>{match.homeTeamName}</span><i>×</i><span>{match.awayTeamName}<CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName}/></span></strong>
          <span className={match.revealed ? "guesses-revealed" : "guesses-locked"}>{match.revealed ? "Palpites liberados" : "🔒 Até o início"}</span>
        </button>)}</div>
      </aside>

      {selected ? <div className="public-guesses-detail">
        <section className="public-guesses-match-hero">
          <div className="public-guesses-match-meta"><span>Jogo {selected.matchNumber}</span><strong>{selected.phaseLabel}</strong><time>{formatKickoff(selected.kickoffAt)}</time></div>
          <div className="public-guesses-teams"><div><CountryFlag iso2={selected.homeTeamIso2} name={selected.homeTeamName} className="public-guesses-team-flag"/><strong>{selected.homeTeamName}</strong></div><b>{selected.finalScore ? `${selected.finalScore.home} × ${selected.finalScore.away}` : "×"}</b><div><CountryFlag iso2={selected.awayTeamIso2} name={selected.awayTeamName} className="public-guesses-team-flag"/><strong>{selected.awayTeamName}</strong></div></div>
          {selected.finalScore ? <small className="public-guesses-final-label">✓ Resultado final e pontos calculados</small> : selected.venue ? <small>📍 {selected.venue}</small> : null}
        </section>

        {!selected.revealed ? <section className="card public-guesses-locked-card"><span>🔒</span><div><h3>Palpites ainda protegidos</h3><p>Todos os palpites desta partida serão exibidos a partir de {formatKickoff(selected.revealAt)}.</p></div></section> : <section className="card public-guesses-table-card">
          <div className="public-guesses-table-head"><div><div className="eyebrow">Palpites liberados</div><h3>{selected.rows.length} participantes</h3></div><div className="public-guesses-participant-filters"><input className="input" placeholder="Buscar participante" value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)}/><select className="input" value={participantFilter} onChange={(event) => setParticipantFilter(event.target.value as ParticipantFilter)}><option value="ALL">Todos</option><option value="HUMAN">Humanos</option><option value="BOT">Bots</option></select></div></div>
          <div className="table-wrap"><table className="public-guesses-table"><thead><tr><th>Participante</th><th>Palpite</th><th>Pontos no jogo</th><th>Tipo</th><th>Time Carisma</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.participantId} className={row.participantId === currentUserId ? "current-user" : ""}><td><span className="public-guess-person">{avatar(row)}<strong>{row.displayName}</strong></span></td><td><strong className={row.guesses.length ? "public-guess-score" : "public-guess-empty"}>{guessText(row)}</strong></td><td><strong className={`public-guess-points ${row.points == null ? "pending" : row.points > 0 ? "positive" : "zero"}`}>{pointsText(row.points)}</strong></td><td><span className={`badge ${row.participantType === "BOT" ? "badge-gold" : ""}`}>{row.participantType === "BOT" ? "Bot" : "Humano"}</span></td><td>{row.isCarismaMatch ? <span className="public-guess-carisma">✨ Sim</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
        </section>}
      </div> : null}
    </div>}
  </div>;
}
