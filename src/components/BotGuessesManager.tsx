"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type BotOption = { id: string; name: string; strategy: string };
type BotGuessRow = {
  matchId: string;
  guessId: string | null;
  matchNumber: number;
  phase: string;
  group?: string | null;
  groupRound?: number | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  venue?: string | null;
  kickoffAt: string | null;
  matchStatus: string;
  teamsResolved: boolean;
  locked: boolean;
  prediction: { home: number; away: number } | null;
  source: "BOT_AUTOMATIC" | "ADMIN_OVERRIDE" | null;
  overrideReason?: string | null;
  revision: number;
};

type Payload = {
  bots: BotOption[];
  selectedBotId: string | null;
  rows: BotGuessRow[];
  serverTime: string;
};

type EditDraft = { home: string; away: string; reason: string };

function phaseLabel(row: BotGuessRow) {
  if (row.phase === "GROUP_STAGE") return `Grupo ${row.group ?? "-"} · Rodada ${row.groupRound ?? "-"}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinal",
    THIRD_PLACE: "3º lugar",
    FINAL: "Final",
    DEMO: "Demonstração"
  };
  return labels[row.phase] ?? row.phase;
}

function sourceLabel(source: BotGuessRow["source"]) {
  if (source === "ADMIN_OVERRIDE") return "Manual";
  if (source === "BOT_AUTOMATIC") return "Automático";
  return "Não gerado";
}

export default function BotGuessesManager() {
  const [bots, setBots] = useState<BotOption[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [rows, setRows] = useState<BotGuessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ home: "", away: "", reason: "" });
  const [saving, setSaving] = useState(false);

  async function load(botId?: string) {
    setLoading(true);
    setError("");
    try {
      const query = botId ? `?botId=${encodeURIComponent(botId)}` : "";
      const response = await fetch(`/api/admin/bot-guesses${query}`, { cache: "no-store" });
      const data = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar palpites dos bots");
      setBots(data.bots);
      setRows(data.rows);
      setSelectedBotId(data.selectedBotId ?? "");
      setEditingMatchId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar palpites dos bots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const groups = useMemo(
    () => Array.from(new Set(rows.map((row) => row.group).filter((value): value is string => Boolean(value)))).sort(),
    [rows]
  );

  const phases = useMemo(
    () => Array.from(new Set(rows.map((row) => row.phase).filter(Boolean))),
    [rows]
  );

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (phaseFilter !== "ALL" && row.phase !== phaseFilter) return false;
    if (groupFilter !== "ALL" && row.group !== groupFilter) return false;
    return true;
  }), [rows, phaseFilter, groupFilter]);

  const generatedCount = rows.filter((row) => row.prediction).length;
  const manualCount = rows.filter((row) => row.source === "ADMIN_OVERRIDE").length;
  const pendingCount = rows.filter((row) => !row.prediction && !row.locked).length;

  function beginEdit(row: BotGuessRow) {
    setMessage("");
    setEditingMatchId(row.matchId);
    setDraft({
      home: row.prediction?.home.toString() ?? "",
      away: row.prediction?.away.toString() ?? "",
      reason: row.overrideReason ?? ""
    });
  }

  async function save(event: FormEvent, row: BotGuessRow) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/bot-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guessId: row.guessId,
          matchId: row.matchId,
          botId: selectedBotId,
          homeScore: Number(draft.home),
          awayScore: Number(draft.away),
          reason: draft.reason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar palpite");
      setMessage(`Palpite do jogo ${row.matchNumber} salvo e registrado na auditoria.`);
      await load(selectedBotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar palpite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card admin-bot-manager">
      <div className="admin-bot-manager-head">
        <div>
          <div className="eyebrow">Controle operacional dos bots</div>
          <h3>Palpites por bot</h3>
          <p className="muted">Escolha o bot e revise todos os jogos. É possível corrigir um palpite automático ou criar manualmente um palpite ainda não gerado.</p>
        </div>
        <div className="admin-bot-selector">
          <label htmlFor="admin-bot-select">Bot selecionado</label>
          <select
            id="admin-bot-select"
            className="input"
            value={selectedBotId}
            onChange={(event) => void load(event.target.value)}
            disabled={loading || bots.length === 0}
          >
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </div>
      </div>

      <div className="admin-bot-stats">
        <span><strong>{generatedCount}</strong> gerados</span>
        <span><strong>{manualCount}</strong> manuais</span>
        <span><strong>{pendingCount}</strong> pendentes editáveis</span>
        <span><strong>{rows.length}</strong> jogos</span>
      </div>

      <div className="admin-bot-filters">
        <label>Fase
          <select className="input" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
            <option value="ALL">Todas</option>
            {phases.map((phase) => <option key={phase} value={phase}>{phaseLabel({ phase } as BotGuessRow)}</option>)}
          </select>
        </label>
        <label>Grupo
          <select className="input" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="ALL">Todos</option>
            {groups.map((group) => <option key={group} value={group}>Grupo {group}</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary compact-button" onClick={() => void load(selectedBotId)} disabled={loading}>Atualizar</button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Carregando palpites…</p> : null}

      {!loading ? <div className="table-wrap admin-bot-table-wrap">
        <table className="admin-bot-table">
          <thead>
            <tr><th>Jogo</th><th>Partida</th><th>Data</th><th>Palpite</th><th>Origem</th><th>Ação</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const isEditing = editingMatchId === row.matchId;
              return [
                <tr key={row.matchId} className={row.locked ? "admin-bot-locked-row" : ""}>
                  <td><strong>#{row.matchNumber}</strong><small>{phaseLabel(row)}</small></td>
                  <td>
                    <span className="admin-bot-fixture">
                      <span><CountryFlag iso2={row.homeTeamIso2} name={row.homeTeamName}/>{row.homeTeamName}</span>
                      <b>×</b>
                      <span>{row.awayTeamName}<CountryFlag iso2={row.awayTeamIso2} name={row.awayTeamName}/></span>
                    </span>
                  </td>
                  <td>{row.kickoffAt ? new Date(row.kickoffAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "A definir"}</td>
                  <td><strong className="admin-bot-score">{row.prediction ? `${row.prediction.home} × ${row.prediction.away}` : "—"}</strong></td>
                  <td><span className={`badge ${row.source === "ADMIN_OVERRIDE" ? "badge-gold" : row.source ? "badge-open" : "badge-locked"}`}>{sourceLabel(row.source)}</span></td>
                  <td>
                    <button type="button" className="button button-secondary compact-button" onClick={() => beginEdit(row)} disabled={row.locked}>
                      {row.prediction ? "Editar" : "Criar"}
                    </button>
                  </td>
                </tr>,
                isEditing ? <tr key={`${row.matchId}-edit`} className="admin-bot-edit-row">
                  <td colSpan={6}>
                    <form className="admin-bot-edit-form" onSubmit={(event) => void save(event, row)}>
                      <div className="admin-bot-edit-title"><strong>Editar jogo {row.matchNumber}</strong><span>{row.homeTeamName} × {row.awayTeamName}</span></div>
                      <label>Casa<input className="input" inputMode="numeric" value={draft.home} onChange={(event) => setDraft((old) => ({ ...old, home: event.target.value.replace(/\D/g, "").slice(0, 2) }))} required /></label>
                      <label>Fora<input className="input" inputMode="numeric" value={draft.away} onChange={(event) => setDraft((old) => ({ ...old, away: event.target.value.replace(/\D/g, "").slice(0, 2) }))} required /></label>
                      <label className="admin-bot-reason">Justificativa<input className="input" value={draft.reason} onChange={(event) => setDraft((old) => ({ ...old, reason: event.target.value }))} minLength={10} maxLength={500} required placeholder="Explique a intervenção administrativa" /></label>
                      <div className="admin-bot-edit-actions">
                        <button type="button" className="button button-secondary compact-button" onClick={() => setEditingMatchId(null)}>Cancelar</button>
                        <button className="button button-primary compact-button" disabled={saving}>{saving ? "Salvando…" : "Salvar palpite"}</button>
                      </div>
                    </form>
                  </td>
                </tr> : null
              ];
            })}
            {!filteredRows.length ? <tr><td colSpan={6}>Nenhum jogo encontrado para os filtros selecionados.</td></tr> : null}
          </tbody>
        </table>
      </div> : null}
    </section>
  );
}
