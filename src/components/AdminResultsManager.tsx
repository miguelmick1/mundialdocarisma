"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type MatchRow = {
  id: string;
  matchNumber: number;
  phase: string;
  group?: string | null;
  groupRound?: number | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  teamsResolved: boolean;
  kickoffAt: string | null;
  venue?: string | null;
  status: string;
  scoringStatus: string;
  livePeriod?: string | null;
  liveMinute?: number | null;
  liveHomeScore?: number | null;
  liveAwayScore?: number | null;
  homeScore90?: number | null;
  awayScore90?: number | null;
  homeScore120?: number | null;
  awayScore120?: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  resultSource?: string | null;
  apiFootballFixtureId?: number | null;
  apiFootballStatus?: string | null;
  apiFootballStatusLong?: string | null;
  apiFootballNeedsReview?: boolean;
  apiFootballLastFetchedAt?: string | null;
  liveSyncPaused?: boolean;
  liveUpdatedAt?: string | null;
  resultConfirmedAt?: string | null;
  voidReason?: string | null;
};

type IntegrationState = {
  configured: boolean;
  schedulerSecretConfigured: boolean;
  state: {
    lastSuccessfulAt: string | null;
    lastError: string | null;
    linkedMatches: number;
    updatedMatches: number;
    reviewMatches: number;
    dailyRemaining: number | null;
    minuteRemaining: number | null;
  };
};

type Draft = {
  livePeriod: "1H" | "HT" | "2H" | "ET" | "PEN";
  liveMinute: string;
  liveHomeScore: string;
  liveAwayScore: string;
  homeScore90: string;
  awayScore90: string;
  homeScore120: string;
  awayScore120: string;
  homePenalties: string;
  awayPenalties: string;
  voidReason: string;
};

const PHASE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Fase de grupos",
  ROUND_OF_32: "16-avos",
  ROUND_OF_16: "Oitavas",
  QUARTER_FINAL: "Quartas",
  SEMI_FINAL: "Semifinais",
  THIRD_PLACE: "3º lugar",
  FINAL: "Final",
  DEMO: "Demonstração"
};

function phaseLabel(row: MatchRow) {
  if (row.phase === "GROUP_STAGE") return `Grupo ${row.group ?? "-"} · Rodada ${row.groupRound ?? "-"}`;
  return PHASE_LABELS[row.phase] ?? row.phase;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    SCHEDULED: "Agendado",
    LIVE: "Ao vivo",
    HALFTIME: "Intervalo",
    EXTRA_TIME: "Prorrogação",
    FINISHED_PROVISIONAL: "Final provisório",
    FINISHED: "Confirmado",
    VOID: "Anulado"
  };
  return labels[status] ?? status;
}

function numberOrNull(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function draftFromMatch(match: MatchRow): Draft {
  return {
    livePeriod: (match.livePeriod as Draft["livePeriod"]) ?? "1H",
    liveMinute: match.liveMinute?.toString() ?? "",
    liveHomeScore: match.liveHomeScore?.toString() ?? "0",
    liveAwayScore: match.liveAwayScore?.toString() ?? "0",
    homeScore90: match.homeScore90?.toString() ?? match.liveHomeScore?.toString() ?? "",
    awayScore90: match.awayScore90?.toString() ?? match.liveAwayScore?.toString() ?? "",
    homeScore120: match.homeScore120?.toString() ?? "",
    awayScore120: match.awayScore120?.toString() ?? "",
    homePenalties: match.homePenalties?.toString() ?? "",
    awayPenalties: match.awayPenalties?.toString() ?? "",
    voidReason: match.voidReason ?? ""
  };
}

export default function AdminResultsManager() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTION");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MatchRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [integrationBusy, setIntegrationBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [response, integrationResponse] = await Promise.all([
        fetch("/api/admin/match-result", { cache: "no-store" }),
        fetch("/api/live-score/sync", { cache: "no-store" })
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar jogos");
      setMatches(data.matches ?? []);
      if (integrationResponse.ok) setIntegration(await integrationResponse.json());
      if (editing) {
        const updated = (data.matches as MatchRow[]).find((match) => match.id === editing.id);
        if (updated) {
          setEditing(updated);
          setDraft(draftFromMatch(updated));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar jogos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const phases = useMemo(() => Array.from(new Set(matches.map((match) => match.phase))).filter(Boolean), [matches]);
  const filtered = useMemo(() => matches.filter((match) => {
    if (phaseFilter !== "ALL" && match.phase !== phaseFilter) return false;
    if (statusFilter === "ACTION" && !["LIVE", "HALFTIME", "EXTRA_TIME", "FINISHED_PROVISIONAL"].includes(match.status)) {
      const kickoff = match.kickoffAt ? new Date(match.kickoffAt).getTime() : Infinity;
      if (!(match.status === "SCHEDULED" && kickoff <= Date.now() + 24 * 60 * 60 * 1000)) return false;
    }
    if (statusFilter !== "ALL" && statusFilter !== "ACTION" && match.status !== statusFilter) return false;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (query && !`${match.matchNumber} ${match.homeTeamName} ${match.awayTeamName}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
    return true;
  }), [matches, phaseFilter, statusFilter, search]);

  function open(match: MatchRow) {
    setEditing(match);
    setDraft(draftFromMatch(match));
    setMessage("");
    setError("");
  }

  async function submit(action: "UPDATE_LIVE" | "SAVE_PROVISIONAL" | "CONFIRM" | "VOID" | "RESUME_API", event?: FormEvent) {
    event?.preventDefault();
    if (!editing || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/match-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: editing.id,
          action,
          livePeriod: draft.livePeriod,
          liveMinute: numberOrNull(draft.liveMinute),
          liveHomeScore: numberOrNull(draft.liveHomeScore),
          liveAwayScore: numberOrNull(draft.liveAwayScore),
          homeScore90: numberOrNull(draft.homeScore90),
          awayScore90: numberOrNull(draft.awayScore90),
          homeScore120: numberOrNull(draft.homeScore120),
          awayScore120: numberOrNull(draft.awayScore120),
          homePenalties: numberOrNull(draft.homePenalties),
          awayPenalties: numberOrNull(draft.awayPenalties),
          voidReason: draft.voidReason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      setMessage(action === "UPDATE_LIVE" ? "Placar ao vivo atualizado; a sincronização automática deste jogo foi pausada." : action === "SAVE_PROVISIONAL" ? "Resultado provisório salvo; a sincronização automática deste jogo foi pausada." : action === "CONFIRM" ? "Resultado confirmado e pontos calculados." : action === "RESUME_API" ? "Sincronização automática retomada para esta partida." : "Partida anulada e ranking recalculado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação não concluída");
    } finally {
      setSaving(false);
    }
  }


  async function integrationAction(action: "LINK" | "SYNC") {
    setIntegrationBusy(true);
    setError("");
    setMessage("");
    try {
      const endpoint = action === "LINK" ? "/api/admin/api-football/link" : "/api/live-score/sync";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "SYNC" ? { force: true, fullSchedule: true } : {})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      setMessage(action === "LINK"
        ? `${data.result.linkedMatches} jogos vinculados à API-Football.`
        : `${data.result.updatedMatches} jogos consultados na API-Football.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação não concluída");
    } finally {
      setIntegrationBusy(false);
    }
  }

  if (loading && !matches.length) return <section className="card">Carregando central de resultados…</section>;

  return <>
    <section className="card api-football-admin-card">
      <div>
        <div className="eyebrow">Integração automática</div>
        <h3>API-Football</h3>
        <p className="muted">{integration?.configured ? "Chave configurada. Vincule os jogos uma vez e use a atualização automática ou manual." : "A chave API_FOOTBALL_KEY ainda não foi encontrada neste ambiente."}</p>
        <div className="api-football-status-line">
          <span>Jogos vinculados: <b>{integration?.state.linkedMatches ?? 0}</b></span>
          <span>Último sucesso: <b>{integration?.state.lastSuccessfulAt ? new Date(integration.state.lastSuccessfulAt).toLocaleString("pt-BR") : "ainda não executado"}</b></span>
          {integration?.state.dailyRemaining != null ? <span>Cota diária restante: <b>{integration.state.dailyRemaining}</b></span> : null}
        </div>
        {integration?.state.lastError ? <p className="error">Último erro: {integration.state.lastError}</p> : null}
      </div>
      <div className="api-football-admin-actions">
        <button className="button" disabled={integrationBusy || !integration?.configured} type="button" onClick={() => integrationAction("LINK")}>Vincular jogos</button>
        <button className="button button-primary" disabled={integrationBusy || !integration?.configured} type="button" onClick={() => integrationAction("SYNC")}>{integrationBusy ? "Processando…" : "Atualizar agora"}</button>
      </div>
    </section>
    <div className="admin-results-layout">
    <section className="card admin-results-list">
      <div className="admin-results-toolbar">
        <div><label>Status</label><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ACTION">Requer atenção</option><option value="ALL">Todos</option><option value="SCHEDULED">Agendados</option><option value="LIVE">Ao vivo</option><option value="HALFTIME">Intervalo</option><option value="EXTRA_TIME">Prorrogação</option><option value="FINISHED_PROVISIONAL">Finais provisórios</option><option value="FINISHED">Confirmados</option><option value="VOID">Anulados</option></select></div>
        <div><label>Fase</label><select className="input" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}><option value="ALL">Todas</option>{phases.map((phase) => <option key={phase} value={phase}>{PHASE_LABELS[phase] ?? phase}</option>)}</select></div>
        <div className="admin-result-search"><label>Buscar jogo</label><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número ou seleção" /></div>
        <button className="button" type="button" onClick={() => load()}>Atualizar</button>
      </div>

      {error && !editing ? <p className="error">{error}</p> : null}
      <div className="admin-results-table-wrap">
        <table className="admin-results-table"><thead><tr><th>Jogo</th><th>Partida</th><th>Data</th><th>Placar</th><th>Status</th><th></th></tr></thead><tbody>
          {filtered.map((match) => <tr key={match.id} className={editing?.id === match.id ? "selected-admin-row" : ""}>
            <td><strong>#{match.matchNumber}</strong><small>{phaseLabel(match)}</small></td>
            <td><span className="admin-match-teams"><span><CountryFlag iso2={match.homeTeamIso2} name={match.homeTeamName} />{match.homeTeamName}</span><i>×</i><span>{match.awayTeamName}<CountryFlag iso2={match.awayTeamIso2} name={match.awayTeamName} /></span></span></td>
            <td>{match.kickoffAt ? new Date(match.kickoffAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
            <td><strong>{match.liveHomeScore ?? match.homeScore120 ?? match.homeScore90 ?? "–"} × {match.liveAwayScore ?? match.awayScore120 ?? match.awayScore90 ?? "–"}</strong></td>
            <td><span className={`admin-status-pill status-${match.status.toLowerCase()}`}>{statusLabel(match.status)}</span>{match.apiFootballNeedsReview ? <small className="api-review-label">Revisar API: {match.apiFootballStatus}</small> : null}{match.liveSyncPaused ? <small className="api-paused-label">API pausada</small> : null}</td>
            <td><button className="button button-small" type="button" onClick={() => open(match)}>Abrir</button></td>
          </tr>)}
          {!filtered.length ? <tr><td colSpan={6}>Nenhum jogo encontrado para os filtros.</td></tr> : null}
        </tbody></table>
      </div>
    </section>

    {editing && draft ? <aside className="card admin-result-editor">
      <div className="admin-editor-head"><div><div className="eyebrow">Jogo {editing.matchNumber}</div><h3>{editing.homeTeamName} × {editing.awayTeamName}</h3><p>{phaseLabel(editing)}</p></div><button type="button" className="drawer-close" onClick={() => setEditing(null)}>×</button></div>

      <section className="admin-editor-section"><h4>Placar ao vivo</h4><p className="muted">A API-Football atualiza automaticamente. Uma edição manual pausa a API apenas para este jogo.</p>{editing.apiFootballFixtureId ? <p className="api-fixture-meta">Fixture #{editing.apiFootballFixtureId} · {editing.apiFootballStatusLong ?? editing.apiFootballStatus ?? "sem status"}</p> : <p className="api-fixture-meta warning">Jogo ainda não vinculado à API-Football.</p>}
        <div className="admin-live-grid"><label>Período<select className="input" value={draft.livePeriod} onChange={(event) => setDraft({ ...draft, livePeriod: event.target.value as Draft["livePeriod"] })}><option value="1H">1º tempo</option><option value="HT">Intervalo</option><option value="2H">2º tempo</option><option value="ET">Prorrogação</option><option value="PEN">Pênaltis</option></select></label><label>Minuto<input className="input" inputMode="numeric" value={draft.liveMinute} onChange={(event) => setDraft({ ...draft, liveMinute: event.target.value.replace(/\D/g, "") })} /></label></div>
        <div className="admin-score-row"><label>{editing.homeTeamName}<input className="score-input" inputMode="numeric" value={draft.liveHomeScore} onChange={(event) => setDraft({ ...draft, liveHomeScore: event.target.value.replace(/\D/g, "") })} /></label><b>×</b><label>{editing.awayTeamName}<input className="score-input" inputMode="numeric" value={draft.liveAwayScore} onChange={(event) => setDraft({ ...draft, liveAwayScore: event.target.value.replace(/\D/g, "") })} /></label></div>
        <div className="admin-result-actions"><button disabled={saving || editing.status === "FINISHED" || editing.status === "VOID"} type="button" className="button button-primary" onClick={() => submit("UPDATE_LIVE")}>Publicar atualização manual</button>{editing.liveSyncPaused && editing.status !== "FINISHED" && editing.status !== "VOID" ? <button disabled={saving} type="button" className="button" onClick={() => submit("RESUME_API")}>Retomar API</button> : null}</div>
      </section>

      <section className="admin-editor-section"><h4>Resultado da partida</h4>
        <div className="admin-result-score-grid"><label>90 min — mandante<input className="input" inputMode="numeric" value={draft.homeScore90} onChange={(event) => setDraft({ ...draft, homeScore90: event.target.value.replace(/\D/g, "") })} /></label><label>90 min — visitante<input className="input" inputMode="numeric" value={draft.awayScore90} onChange={(event) => setDraft({ ...draft, awayScore90: event.target.value.replace(/\D/g, "") })} /></label><label>120 min — mandante<input className="input" inputMode="numeric" value={draft.homeScore120} onChange={(event) => setDraft({ ...draft, homeScore120: event.target.value.replace(/\D/g, "") })} placeholder="Opcional" /></label><label>120 min — visitante<input className="input" inputMode="numeric" value={draft.awayScore120} onChange={(event) => setDraft({ ...draft, awayScore120: event.target.value.replace(/\D/g, "") })} placeholder="Opcional" /></label><label>Pênaltis — mandante<input className="input" inputMode="numeric" value={draft.homePenalties} onChange={(event) => setDraft({ ...draft, homePenalties: event.target.value.replace(/\D/g, "") })} placeholder="Não pontua" /></label><label>Pênaltis — visitante<input className="input" inputMode="numeric" value={draft.awayPenalties} onChange={(event) => setDraft({ ...draft, awayPenalties: event.target.value.replace(/\D/g, "") })} placeholder="Não pontua" /></label></div>
        <div className="admin-result-actions"><button disabled={saving || editing.status === "FINISHED" || editing.status === "VOID"} type="button" className="button" onClick={() => submit("SAVE_PROVISIONAL")}>Salvar como provisório</button><button disabled={saving || editing.status === "FINISHED" || editing.status === "VOID"} type="button" className="button button-primary" onClick={() => submit("CONFIRM")}>Confirmar e calcular pontos</button></div>
      </section>

      <section className="admin-editor-section admin-void-section"><h4>Anular partida</h4><label>Justificativa<input className="input" value={draft.voidReason} onChange={(event) => setDraft({ ...draft, voidReason: event.target.value })} placeholder="Ex.: jogo abandonado ou resultado corrigido" /></label><button disabled={saving || draft.voidReason.trim().length < 5 || editing.status === "VOID"} type="button" className="button button-danger" onClick={() => submit("VOID")}>Anular e remover pontuação</button></section>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </aside> : <aside className="card admin-result-editor admin-editor-empty"><span>⚽</span><h3>Selecione uma partida</h3><p className="muted">O editor permite publicar o placar ao vivo, salvar o resultado provisório e confirmar a pontuação oficial.</p></aside>}
    </div>
  </>;
}
