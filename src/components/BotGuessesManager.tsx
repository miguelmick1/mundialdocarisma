"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type BotOption = { id: string; name: string; strategy: string; guessMode: "AUTOMATIC" | "MANUAL"; guessingEnabled: boolean };
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
  hasStarted: boolean;
  locked: boolean;
  prediction: { home: number; away: number } | null;
  source: "BOT_AUTOMATIC" | "ADMIN_OVERRIDE" | null;
  overrideReason?: string | null;
  revision: number;
  botGuessingEnabled: boolean;
  botGuessMode: "AUTOMATIC" | "MANUAL";
};

type CarismaTeamOption = {
  id: string;
  name: string;
  iso2: string | null;
  group: string | null;
  eligible: boolean;
  unavailableReason: string | null;
  firstKickoff: string | null;
};

type BotCarismaRound = {
  id: string;
  label: string;
  selectedTeam: CarismaTeamOption | null;
  locked: boolean;
  lockAt: string | null;
  teams: CarismaTeamOption[];
  hasResolvedMatches: boolean;
  sharedAcrossGroupStage: boolean;
};

type Payload = {
  bots: BotOption[];
  selectedBotId: string | null;
  rows: BotGuessRow[];
  carismaRounds?: BotCarismaRound[];
  serverTime: string;
  selectedBotGuessingEnabled?: boolean;
  selectedBotGuessMode?: "AUTOMATIC" | "MANUAL";
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
    DEMO: "Demonstração",
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
  const [carismaRounds, setCarismaRounds] = useState<BotCarismaRound[]>([]);
  const [carismaRoundId, setCarismaRoundId] = useState("");
  const [carismaTeamId, setCarismaTeamId] = useState("");
  const [carismaSaving, setCarismaSaving] = useState(false);
  const [carismaMessage, setCarismaMessage] = useState("");
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
      const nextRounds = data.carismaRounds ?? [];
      setBots(data.bots);
      setRows(data.rows);
      setSelectedBotId(data.selectedBotId ?? "");
      setCarismaRounds(nextRounds);
      setCarismaRoundId((current) => {
        const selectedRound = nextRounds.find((round) => round.id === current) ?? nextRounds[0];
        setCarismaTeamId(selectedRound?.selectedTeam?.id ?? "");
        return selectedRound?.id ?? "";
      });
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
    [rows],
  );
  const phases = useMemo(
    () => Array.from(new Set(rows.map((row) => row.phase).filter(Boolean))),
    [rows],
  );
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (phaseFilter !== "ALL" && row.phase !== phaseFilter) return false;
    if (groupFilter !== "ALL" && row.group !== groupFilter) return false;
    return true;
  }), [rows, phaseFilter, groupFilter]);

  const selectedBot = bots.find((bot) => bot.id === selectedBotId);
  const activeCarismaRound = carismaRounds.find((round) => round.id === carismaRoundId) ?? carismaRounds[0];
  const generatedCount = rows.filter((row) => row.prediction).length;
  const manualCount = rows.filter((row) => row.source === "ADMIN_OVERRIDE").length;
  const pendingCount = rows.filter((row) => !row.prediction && !row.locked).length;
  const lateEditableCount = rows.filter((row) => row.hasStarted && !row.locked).length;

  function changeCarismaRound(roundId: string) {
    const round = carismaRounds.find((item) => item.id === roundId);
    setCarismaRoundId(roundId);
    setCarismaTeamId(round?.selectedTeam?.id ?? "");
    setCarismaMessage("");
  }

  async function saveCarisma(event: FormEvent) {
    event.preventDefault();
    if (!activeCarismaRound || !carismaTeamId || !selectedBotId) return;
    setCarismaSaving(true);
    setCarismaMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/bot-carisma", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: selectedBotId, roundId: activeCarismaRound.id, teamId: carismaTeamId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar Time Carisma");
      setCarismaMessage(activeCarismaRound.sharedAcrossGroupStage
        ? "Time Carisma salvo para as três rodadas da fase de grupos."
        : "Time Carisma salvo para esta fase.");
      await load(selectedBotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar Time Carisma");
    } finally {
      setCarismaSaving(false);
    }
  }

  function beginEdit(row: BotGuessRow) {
    setMessage("");
    setEditingMatchId(row.matchId);
    setDraft({
      home: row.prediction?.home.toString() ?? "",
      away: row.prediction?.away.toString() ?? "",
      reason: row.overrideReason ?? "",
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
          reason: draft.reason,
        }),
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
          <h3>Palpites e Time Carisma</h3>
          <p className="muted">Maria e Pangaré são automáticos. Betinho Everyday e Transbot recebem palpites manuais. O administrador pode criar ou corrigir qualquer palpite de bot mesmo depois do início do jogo.</p>
        </div>
        <div className="admin-bot-selector">
          <label htmlFor="admin-bot-select">Bot selecionado</label>
          <select
            id="admin-bot-select"
            className="input"
            value={selectedBotId}
            onChange={(event) => { setCarismaMessage(""); void load(event.target.value); }}
            disabled={loading || bots.length === 0}
          >
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name} — {bot.guessMode === "AUTOMATIC" ? "automático" : "manual"}</option>)}
          </select>
        </div>
      </div>

      {selectedBot ? <p className="admin-bot-mode-note"><strong>{selectedBot.name}</strong>: {selectedBot.guessMode === "AUTOMATIC"
        ? "o palpite é gerado automaticamente após o início da partida, mas o administrador pode criá-lo ou corrigi-lo manualmente a qualquer momento."
        : "o palpite é informado pelo administrador e pode ser criado ou corrigido antes ou depois do início da partida."}</p> : null}

      <form className="admin-bot-carisma" onSubmit={(event) => void saveCarisma(event)}>
        <div className="admin-bot-carisma-heading">
          <div><div className="eyebrow">Time Carisma do bot</div><h4>Escolha a seleção que dobra a pontuação básica</h4></div>
          {activeCarismaRound?.selectedTeam ? <div className="admin-bot-carisma-current">
            <CountryFlag iso2={activeCarismaRound.selectedTeam.iso2} name={activeCarismaRound.selectedTeam.name} />
            <span><small>Escolha atual</small><strong>{activeCarismaRound.selectedTeam.name}</strong></span>
          </div> : <span className="badge badge-locked">Ainda não escolhido</span>}
        </div>
        <div className="admin-bot-carisma-controls">
          <label>Fase
            <select className="input" value={carismaRoundId} onChange={(event) => changeCarismaRound(event.target.value)} disabled={loading || !carismaRounds.length}>
              {carismaRounds.map((round) => <option key={round.id} value={round.id}>{round.label}</option>)}
            </select>
          </label>
          <label>Seleção
            <select className="input" value={carismaTeamId} onChange={(event) => setCarismaTeamId(event.target.value)} disabled={!activeCarismaRound || activeCarismaRound.locked || !activeCarismaRound.hasResolvedMatches} required>
              <option value="">Selecione uma seleção</option>
              {activeCarismaRound?.teams.map((team) => <option key={team.id} value={team.id} disabled={!team.eligible && team.id !== activeCarismaRound.selectedTeam?.id}>
                {team.name}{team.group ? ` · Grupo ${team.group}` : ""}{!team.eligible && team.unavailableReason ? ` · ${team.unavailableReason}` : ""}
              </option>)}
            </select>
          </label>
          <button className="button button-yellow" disabled={carismaSaving || !carismaTeamId || activeCarismaRound?.locked || !activeCarismaRound?.hasResolvedMatches}>
            {carismaSaving ? "Salvando…" : activeCarismaRound?.selectedTeam ? "Alterar Time Carisma" : "Salvar Time Carisma"}
          </button>
        </div>
        {activeCarismaRound?.sharedAcrossGroupStage ? <p className="muted">A escolha da fase de grupos vale automaticamente nas três rodadas.</p> : null}
        {activeCarismaRound?.locked ? <p className="admin-bot-carisma-locked">🔒 Escolha bloqueada: o primeiro jogo da seleção já começou.</p> : null}
        {carismaMessage ? <p className="success">{carismaMessage}</p> : null}
      </form>

      <div className="admin-bot-stats">
        <span><strong>{generatedCount}</strong> preenchidos</span>
        <span><strong>{manualCount}</strong> manuais</span>
        <span><strong>{pendingCount}</strong> pendentes editáveis</span>
        <span><strong>{lateEditableCount}</strong> jogos já iniciados editáveis</span>
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
          <thead><tr><th>Jogo</th><th>Partida</th><th>Data</th><th>Palpite</th><th>Origem</th><th>Ação</th></tr></thead>
          <tbody>
            {filteredRows.map((row) => {
              const isEditing = editingMatchId === row.matchId;
              return <Fragment key={row.matchId}>
                <tr className={`${row.locked ? "admin-bot-locked-row" : ""} ${row.hasStarted && !row.locked ? "admin-bot-late-editable-row" : ""}`.trim()}>
                  <td><strong>#{row.matchNumber}</strong><small>{phaseLabel(row)}</small></td>
                  <td><span className="admin-bot-fixture"><span><CountryFlag iso2={row.homeTeamIso2} name={row.homeTeamName} />{row.homeTeamName}</span><b>×</b><span>{row.awayTeamName}<CountryFlag iso2={row.awayTeamIso2} name={row.awayTeamName} /></span></span></td>
                  <td><span>{row.kickoffAt ? new Date(row.kickoffAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "A definir"}</span>{row.hasStarted && !row.locked ? <small className="admin-bot-late-label">Jogo iniciado · edição liberada ao admin</small> : null}</td>
                  <td><strong className="admin-bot-score">{row.prediction ? `${row.prediction.home} × ${row.prediction.away}` : "—"}</strong></td>
                  <td><span className={`badge ${row.source === "ADMIN_OVERRIDE" ? "badge-gold" : row.source ? "badge-open" : "badge-locked"}`}>{sourceLabel(row.source)}</span></td>
                  <td><button type="button" className="button button-secondary compact-button" onClick={() => beginEdit(row)} disabled={row.locked || !row.botGuessingEnabled}>{row.prediction ? "Corrigir" : "Criar"}</button></td>
                </tr>
                {isEditing ? <tr className="admin-bot-edit-row"><td colSpan={6}>
                  <form className="admin-bot-edit-form" onSubmit={(event) => void save(event, row)}>
                    <div className="admin-bot-edit-title"><strong>Editar jogo {row.matchNumber}</strong><span>{row.homeTeamName} × {row.awayTeamName}</span></div>
                    <label>Casa<input className="input" inputMode="numeric" value={draft.home} onChange={(event) => setDraft((old) => ({ ...old, home: event.target.value.replace(/\D/g, "").slice(0, 2) }))} required /></label>
                    <label>Fora<input className="input" inputMode="numeric" value={draft.away} onChange={(event) => setDraft((old) => ({ ...old, away: event.target.value.replace(/\D/g, "").slice(0, 2) }))} required /></label>
                    <label className="admin-bot-reason">Justificativa<input className="input" value={draft.reason} onChange={(event) => setDraft((old) => ({ ...old, reason: event.target.value }))} minLength={10} maxLength={500} required placeholder={row.hasStarted ? "Explique por que o palpite foi incluído ou corrigido após o início" : "Explique a intervenção administrativa"} /></label>
                    <div className="admin-bot-edit-actions"><button type="button" className="button button-secondary compact-button" onClick={() => setEditingMatchId(null)}>Cancelar</button><button className="button button-primary compact-button" disabled={saving}>{saving ? "Salvando…" : "Salvar palpite"}</button></div>
                  </form>
                </td></tr> : null}
              </Fragment>;
            })}
            {!filteredRows.length ? <tr><td colSpan={6}>Nenhum jogo encontrado para os filtros selecionados.</td></tr> : null}
          </tbody>
        </table>
      </div> : null}
    </section>
  );
}
