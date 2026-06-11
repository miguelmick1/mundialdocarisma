"use client";

import { useEffect, useMemo, useState } from "react";
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
  resultSource?: string | null;
  liveUpdatedAt?: string | null;
  resultConfirmedAt?: string | null;
  voidReason?: string | null;
};

type MatchStage = "1H" | "HT" | "2H" | "ET" | "FINAL";

type Draft = {
  stage: MatchStage;
  minute: string;
  homeScore: string;
  awayScore: string;
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

const STAGE_LABELS: Record<MatchStage, string> = {
  "1H": "1º tempo",
  HT: "Intervalo",
  "2H": "2º tempo",
  ET: "Prorrogação",
  FINAL: "Resultado final"
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
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stageFromMatch(match: MatchRow): MatchStage {
  if (match.status === "FINISHED" || match.status === "FINISHED_PROVISIONAL") return "FINAL";
  if (match.status === "HALFTIME" || match.livePeriod === "HT") return "HT";
  if (match.status === "EXTRA_TIME" || match.livePeriod === "ET" || match.livePeriod === "PEN") return "ET";
  if (match.livePeriod === "2H") return "2H";
  return "1H";
}

function currentScore(match: MatchRow, side: "home" | "away") {
  const live = side === "home" ? match.liveHomeScore : match.liveAwayScore;
  const score120 = side === "home" ? match.homeScore120 : match.awayScore120;
  const score90 = side === "home" ? match.homeScore90 : match.awayScore90;
  return live ?? score120 ?? score90 ?? 0;
}

function draftFromMatch(match: MatchRow): Draft {
  return {
    stage: stageFromMatch(match),
    minute: match.liveMinute?.toString() ?? "",
    homeScore: currentScore(match, "home").toString(),
    awayScore: currentScore(match, "away").toString(),
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/match-result", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar jogos");
      const nextMatches = (data.matches ?? []) as MatchRow[];
      setMatches(nextMatches);
      if (editing) {
        const updated = nextMatches.find((match) => match.id === editing.id);
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

  async function saveUpdate() {
    if (!editing || !draft) return;
    const homeScore = numberOrNull(draft.homeScore);
    const awayScore = numberOrNull(draft.awayScore);
    if (homeScore == null || awayScore == null) {
      setError("Informe um placar válido para as duas seleções.");
      return;
    }

    const isFinal = draft.stage === "FINAL";
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/match-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: editing.id,
          action: isFinal ? "CONFIRM" : "UPDATE_LIVE",
          ...(isFinal
            ? {
                homeScore90: homeScore,
                awayScore90: awayScore,
                liveHomeScore: homeScore,
                liveAwayScore: awayScore
              }
            : {
                livePeriod: draft.stage,
                liveMinute: numberOrNull(draft.minute),
                liveHomeScore: homeScore,
                liveAwayScore: awayScore
              })
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      setMessage(isFinal
        ? "Resultado final confirmado e pontuação calculada."
        : `${STAGE_LABELS[draft.stage]} publicado com sucesso.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação não concluída");
    } finally {
      setSaving(false);
    }
  }

  async function voidMatch() {
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
          action: "VOID",
          voidReason: draft.voidReason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      setMessage("Partida anulada e classificação recalculada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação não concluída");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !matches.length) return <section className="card">Carregando central de resultados…</section>;

  const editorLocked = editing?.status === "FINISHED" || editing?.status === "VOID";
  const isFinalDraft = draft?.stage === "FINAL";

  return <div className="admin-results-layout">
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
            <td><span className={`admin-status-pill status-${match.status.toLowerCase()}`}>{statusLabel(match.status)}</span></td>
            <td><button className="button button-small" type="button" onClick={() => open(match)}>Abrir</button></td>
          </tr>)}
          {!filtered.length ? <tr><td colSpan={6}>Nenhum jogo encontrado para os filtros.</td></tr> : null}
        </tbody></table>
      </div>
    </section>

    {editing && draft ? <aside className="card admin-result-editor">
      <div className="admin-editor-head"><div><div className="eyebrow">Jogo {editing.matchNumber}</div><h3>{editing.homeTeamName} × {editing.awayTeamName}</h3><p>{phaseLabel(editing)}</p></div><button type="button" className="drawer-close" onClick={() => setEditing(null)}>×</button></div>

      <section className="admin-editor-section admin-score-update-section">
        <h4>Atualização da partida</h4>
        <p className="muted">Escolha a situação atual, informe o placar e salve. Ao selecionar “Resultado final”, a pontuação do bolão é calculada automaticamente.</p>

        <label className="admin-stage-field">Situação da partida
          <select className="input" value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as MatchStage })} disabled={editorLocked}>
            <option value="1H">1º tempo</option>
            <option value="HT">Intervalo</option>
            <option value="2H">2º tempo</option>
            <option value="ET">Prorrogação</option>
            <option value="FINAL">Resultado final</option>
          </select>
        </label>

        {!isFinalDraft && draft.stage !== "HT" ? <label className="admin-minute-field">Minuto <span>(opcional)</span>
          <input className="input" inputMode="numeric" value={draft.minute} onChange={(event) => setDraft({ ...draft, minute: event.target.value.replace(/\D/g, "") })} placeholder="Ex.: 67" disabled={editorLocked} />
        </label> : null}

        <div className="admin-score-row admin-score-row-primary">
          <label>{editing.homeTeamName}<input className="score-input" inputMode="numeric" value={draft.homeScore} onChange={(event) => setDraft({ ...draft, homeScore: event.target.value.replace(/\D/g, "") })} disabled={editorLocked} /></label>
          <b>×</b>
          <label>{editing.awayTeamName}<input className="score-input" inputMode="numeric" value={draft.awayScore} onChange={(event) => setDraft({ ...draft, awayScore: event.target.value.replace(/\D/g, "") })} disabled={editorLocked} /></label>
        </div>

        {isFinalDraft ? <div className="admin-final-notice"><strong>Resultado final</strong><span>Ao salvar, todos os palpites serão apurados e a classificação será atualizada.</span></div> : null}

        <button disabled={saving || editorLocked} type="button" className="button button-primary admin-save-score-button" onClick={saveUpdate}>
          {saving ? "Salvando…" : isFinalDraft ? "Confirmar resultado e calcular pontos" : "Publicar atualização"}
        </button>
      </section>

      <section className="admin-editor-section admin-void-section"><h4>Anular partida</h4><label>Justificativa<input className="input" value={draft.voidReason} onChange={(event) => setDraft({ ...draft, voidReason: event.target.value })} placeholder="Ex.: jogo abandonado ou resultado corrigido" /></label><button disabled={saving || draft.voidReason.trim().length < 5 || editing.status === "VOID"} type="button" className="button button-danger" onClick={voidMatch}>Anular e remover pontuação</button></section>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </aside> : <aside className="card admin-result-editor admin-editor-empty"><span>⚽</span><h3>Selecione uma partida</h3><p className="muted">Atualize o andamento do jogo ou confirme o resultado final para calcular a pontuação.</p></aside>}
  </div>;
}
