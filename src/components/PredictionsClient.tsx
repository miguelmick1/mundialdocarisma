"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type Guess = { homeScore: number; awayScore: number; revision: number };
type Match = {
  id: string;
  matchNumber: number;
  phase: string;
  group?: string | null;
  groupRound?: number | null;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamIso2?: string | null;
  teamsResolved?: boolean;
  venue?: string | null;
  kickoffAt: string;
  status: string;
  myGuess?: Guess | null;
};

type Draft = { home: string; away: string; state: string; timer?: ReturnType<typeof setTimeout> };
type RoundFilter = "ALL" | "GROUP_1" | "GROUP_2" | "GROUP_3" | "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "THIRD_PLACE" | "FINAL";

const ROUND_FILTERS: Array<{ value: RoundFilter; label: string }> = [
  { value: "ALL", label: "Todos os 104" },
  { value: "GROUP_1", label: "Rodada 1" },
  { value: "GROUP_2", label: "Rodada 2" },
  { value: "GROUP_3", label: "Rodada 3" },
  { value: "ROUND_OF_32", label: "16-avos" },
  { value: "ROUND_OF_16", label: "Oitavas" },
  { value: "QUARTER_FINAL", label: "Quartas" },
  { value: "SEMI_FINAL", label: "Semifinais" },
  { value: "THIRD_PLACE", label: "3º lugar" },
  { value: "FINAL", label: "Final" }
];

function countdown(target: Date, now: number) {
  const diff = Math.max(0, target.getTime() - now);
  const days = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${days ? `${days}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function phaseLabel(match: Match) {
  if (match.phase === "GROUP_STAGE") return `Grupo ${match.group} · Rodada ${match.groupRound}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinal",
    THIRD_PLACE: "Disputa de 3º lugar",
    FINAL: "Grande final"
  };
  return labels[match.phase] ?? match.phase;
}

export default function PredictionsClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    fetch("/api/matches", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar partidas");
      setServerOffset(new Date(data.serverTime).getTime() - Date.now());
      setMatches(data.matches);
      const initial: Record<string, Draft> = {};
      for (const match of data.matches as Match[]) {
        initial[match.id] = {
          home: match.myGuess?.homeScore?.toString() ?? "",
          away: match.myGuess?.awayScore?.toString() ?? "",
          state: match.myGuess ? "Salvo ✓" : "Ainda sem palpite"
        };
      }
      setDrafts(initial);
    }).catch((error) => setLoadError(error instanceof Error ? error.message : "Falha ao carregar partidas"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function persist(matchId: string) {
    const draft = draftsRef.current[matchId];
    if (!draft || draft.home === "" || draft.away === "") return;
    setDrafts((previous) => ({ ...previous, [matchId]: { ...previous[matchId]!, state: "Salvando…" } }));
    try {
      const response = await fetch("/api/guesses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          slot: 1,
          homeScore: Number(draft.home),
          awayScore: Number(draft.away),
          idempotencyKey: crypto.randomUUID()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar");
      setDrafts((previous) => ({
        ...previous,
        [matchId]: {
          ...previous[matchId]!,
          state: `Salvo às ${new Date(data.savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ✓`
        }
      }));
    } catch (error) {
      setDrafts((previous) => ({
        ...previous,
        [matchId]: { ...previous[matchId]!, state: error instanceof Error ? error.message : "Falha ao salvar" }
      }));
    }
  }

  function change(matchId: string, side: "home" | "away", value: string) {
    const sanitized = value.replace(/\D/g, "").slice(0, 2);
    setDrafts((previous) => {
      const old = previous[matchId] ?? { home: "", away: "", state: "" };
      if (old.timer) clearTimeout(old.timer);
      const next: Draft = { ...old, [side]: sanitized, state: "Alterado — aguardando salvamento" };
      next.timer = setTimeout(() => persist(matchId), 650);
      return { ...previous, [matchId]: next };
    });
  }

  const completed = useMemo(
    () => matches.filter((match) => drafts[match.id]?.home !== "" && drafts[match.id]?.away !== "").length,
    [matches, drafts]
  );

  const groups = useMemo(
    () => Array.from(new Set(matches.map((match) => match.group).filter((value): value is string => Boolean(value)))).sort(),
    [matches]
  );

  const filteredMatches = useMemo(() => matches.filter((match) => {
    if (groupFilter !== "ALL" && match.group !== groupFilter) return false;
    if (roundFilter === "ALL") return true;
    if (roundFilter.startsWith("GROUP_")) {
      return match.phase === "GROUP_STAGE" && match.groupRound === Number(roundFilter.slice(-1));
    }
    return match.phase === roundFilter;
  }), [matches, groupFilter, roundFilter]);

  if (loading) return <div className="card">Carregando as 104 partidas…</div>;
  if (loadError) return <div className="error">{loadError}</div>;
  if (!matches.length) return <div className="card"><h3>Calendário ainda não sincronizado</h3><p className="muted">Entre na área de Administração e clique em “Sincronizar 104 partidas”, ou execute <code>npm run sync:worldcup</code>.</p></div>;

  return <>
    <section className="card prediction-summary">
      <div><strong>{completed} de {matches.length} palpites preenchidos</strong><div className="muted">Autosave ativado · bloqueio pelo relógio do servidor</div></div>
      <div className="tournament-stat"><strong>{filteredMatches.length}</strong><span>jogos no filtro</span></div>
      <div className="progress"><div style={{ width: `${matches.length ? completed / matches.length * 100 : 0}%` }} /></div>
    </section>

    <section className="filter-panel">
      <div><div className="filter-label">Por rodada ou fase</div><div className="filter-strip">{ROUND_FILTERS.map((filter) => <button key={filter.value} className={`filter-chip ${roundFilter === filter.value ? "active" : ""}`} onClick={() => setRoundFilter(filter.value)}>{filter.label}</button>)}</div></div>
      <div><div className="filter-label">Por grupo</div><div className="filter-strip"><button className={`filter-chip ${groupFilter === "ALL" ? "active" : ""}`} onClick={() => setGroupFilter("ALL")}>Todos</button>{groups.map((group) => <button key={group} className={`filter-chip ${groupFilter === group ? "active" : ""}`} onClick={() => setGroupFilter(group)}>Grupo {group}</button>)}</div></div>
    </section>

    <div className="match-list compact-match-grid">
      {filteredMatches.map((match) => {
        const kickoff = new Date(match.kickoffAt);
        const now = clock + serverOffset;
        const unresolved = match.teamsResolved === false;
        const locked = now >= kickoff.getTime() || match.status !== "SCHEDULED" || unresolved;
        const draft = drafts[match.id] ?? { home: "", away: "", state: "" };
        const isBrazilMatch = match.homeTeamId === "BRA" || match.awayTeamId === "BRA";
        const statusLabel = unresolved ? "Aguardando seleções" : locked ? "Bloqueado" : countdown(kickoff, now);

        return <article key={match.id} className={`match-card compact-match-card ${isBrazilMatch ? "brazil-match" : ""}`}>
          <div className="compact-match-head">
            <div>
              <strong>Jogo {match.matchNumber}</strong>
              <span>{phaseLabel(match)}</span>
            </div>
            <time>{kickoff.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
          </div>

          <div className="compact-match-body">
            <div className="compact-team compact-team-home">
              <CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName} />
              <span title={match.homeTeamName}>{match.homeTeamName}</span>
            </div>

            <div className="score-inputs compact-score-inputs">
              <input aria-label={`Gols de ${match.homeTeamName}`} inputMode="numeric" className="score-input compact-score-input" disabled={locked} value={draft.home} onChange={(event) => change(match.id, "home", event.target.value)} />
              <strong>×</strong>
              <input aria-label={`Gols de ${match.awayTeamName}`} inputMode="numeric" className="score-input compact-score-input" disabled={locked} value={draft.away} onChange={(event) => change(match.id, "away", event.target.value)} />
            </div>

            <div className="compact-team compact-team-away">
              <span title={match.awayTeamName}>{match.awayTeamName}</span>
              <CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName} />
            </div>
          </div>

          <div className="compact-match-footer">
            <span className={`badge ${locked ? "badge-locked" : "badge-open"}`}>{statusLabel}</span>
            <span className="compact-save-state">{unresolved ? "Libera após definição das seleções" : draft.state}</span>
            {match.venue ? <span className="compact-venue" title={match.venue}>📍 {match.venue}</span> : null}
          </div>
        </article>;
      })}
    </div>
  </>;
}
