"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import CountryFlag from "@/components/CountryFlag";

type EventRow = any;
type Session = {
  id: string;
  kind: "GROUPS" | "CARISMA";
  mode: "REHEARSAL" | "OFFICIAL";
  status: string;
  currentIndex: number;
  events: EventRow[];
  title: string;
};

function PersonAvatar({ name, url, type, className = "" }: { name: string; url?: string | null; type?: string; className?: string }) {
  if (url) return <img className={`draw-person-avatar ${className}`} src={url} alt="" />;
  return <span className={`draw-person-avatar draw-person-avatar-fallback ${type === "BOT" ? "bot" : ""} ${className}`}>
    {type === "BOT" ? "🤖" : String(name || "?").slice(0, 1).toUpperCase()}
  </span>;
}

function GroupBoard({ revealed, latest }: { revealed: EventRow[]; latest: EventRow | null }) {
  const groups = ["A", "B", "C", "D"];
  return <aside className="draw-groups-board card">
    <div className="draw-board-head">
      <div><div className="eyebrow">Composição ao vivo</div><h3>Grupos do Mundial</h3></div>
      <span>{revealed.length}/16</span>
    </div>
    <div className="draw-groups-grid">
      {groups.map((groupId) => {
        const rows = revealed.filter((event) => event.kind === "GROUP_ASSIGNMENT" && event.groupId === groupId);
        return <section key={groupId} className="draw-group-card">
          <header><b>Grupo {groupId}</b><small>{rows.length}/4</small></header>
          <div>
            {[1, 2, 3, 4].map((slot) => {
              const event = rows.find((row) => Number(row.slot) === slot);
              const isLatest = Boolean(event && latest && event.index === latest.index);
              return <article key={slot} className={isLatest ? "latest" : event ? "filled" : "empty"}>
                {event ? <>
                  <PersonAvatar name={event.participantName} url={event.avatarUrl} type={event.participantType} />
                  <span><strong>{event.participantName}</strong><small>{event.participantType === "BOT" ? "Bot" : `Posição ${slot}`}</small></span>
                </> : <><span className="draw-slot-number">{slot}</span><span><strong>Aguardando bolinha</strong><small>Posição {slot}</small></span></>}
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>
  </aside>;
}

function CarismaBoard({ allEvents, revealed, latest }: { allEvents: EventRow[]; revealed: EventRow[]; latest: EventRow | null }) {
  const participants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type?: string; avatarUrl?: string | null }>();
    allEvents.forEach((event) => {
      if (event.kind !== "CARISMA_ASSIGNMENT") return;
      if (!map.has(event.participantId)) {
        map.set(event.participantId, {
          id: event.participantId,
          name: event.participantName,
          type: event.participantType,
          avatarUrl: event.participantAvatarUrl,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [allEvents]);

  return <section className="draw-carisma-board card">
    <div className="draw-board-head">
      <div><div className="eyebrow">Resultado parcial</div><h3>Times Carisma por participante</h3><p>Os três potes vão sendo preenchidos abaixo conforme cada seleção é revelada.</p></div>
      <span>{revealed.filter((event) => event.kind === "CARISMA_ASSIGNMENT").length}/48</span>
    </div>
    <div className="draw-carisma-grid">
      {participants.map((participant) => {
        const teams = revealed.filter((event) => event.kind === "CARISMA_ASSIGNMENT" && event.participantId === participant.id);
        const hasLatest = Boolean(latest?.kind === "CARISMA_ASSIGNMENT" && latest.participantId === participant.id);
        return <article key={participant.id} className={hasLatest ? "latest" : ""}>
          <header>
            <PersonAvatar name={participant.name} url={participant.avatarUrl} type={participant.type} />
            <span><strong>{participant.name}</strong><small>{participant.type === "BOT" ? "Bot" : "Participante"}</small></span>
          </header>
          <div className="draw-carisma-team-list">
            {[1, 2, 3].map((pot) => {
              const team = teams.find((row) => Number(row.pot) === pot);
              return <div key={pot} className={team ? "filled" : "empty"}>
                <b>P{pot}</b>
                {team ? <><CountryFlag iso2={team.teamIso2} name={team.teamName} /><span>{team.teamName}</span></> : <span>Aguardando</span>}
              </div>;
            })}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

export default function DrawsClient({ admin = false }: { admin?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const previousIndex = useRef(-1);

  async function load() {
    const response = await fetch("/api/draws", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar sorteios");
    setSessions(data.sessions ?? []);
    setSelectedId((current) => current || data.sessions?.[0]?.id || "");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    const interval = setInterval(() => load().catch(() => undefined), 1500);
    return () => clearInterval(interval);
  }, []);

  const active = useMemo(() => sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null, [sessions, selectedId]);
  const revealed = active ? active.events.slice(0, active.currentIndex + 1) : [];
  const latest = revealed[revealed.length - 1] ?? null;
  const isSpinning = active ? active.status === "RUNNING" && active.currentIndex !== previousIndex.current : false;
  if (active) previousIndex.current = active.currentIndex;

  async function post(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/draws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      if (data.sessionId) setSelectedId(data.sessionId);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const adminControls = admin ? (
    <section className="card draw-admin-controls draw-admin-controls-top">
      <div className="eyebrow">Controle do administrador</div>
      <h3>Conduzir sorteio</h3>

      {active ? (
        <div className="draw-active-session">
          <small>Sessão atual</small>
          <strong>{active.title}</strong>
          <span>{active.mode === "OFFICIAL" ? "Oficial" : "Ensaio"} · {active.status}</span>
        </div>
      ) : (
        <p className="draw-admin-hint">Crie um ensaio ou sorteio oficial para começar.</p>
      )}

      {active ? (
        <button
          disabled={busy || active.status === "COMPLETED"}
          className="button button-primary draw-next-button draw-next-button-prominent"
          onClick={() => post({ action: "REVEAL_NEXT", sessionId: active.id })}
        >
          Retirar próxima bolinha
        </button>
      ) : null}

      <div className="draw-admin-divider" />
      <small className="draw-admin-section-label">Criar nova sessão</small>
      <div className="draw-admin-buttons draw-admin-buttons-stacked">
        <button disabled={busy} className="button" onClick={() => post({ action: "CREATE", kind: "GROUPS", mode: "REHEARSAL" })}>Ensaio dos grupos</button>
        <button disabled={busy} className="button button-primary" onClick={() => post({ action: "CREATE", kind: "GROUPS", mode: "OFFICIAL" })}>Sorteio oficial dos grupos</button>
        <button disabled={busy} className="button" onClick={() => post({ action: "CREATE", kind: "CARISMA", mode: "REHEARSAL" })}>Ensaio do Carisma</button>
        <button disabled={busy} className="button button-yellow" onClick={() => post({ action: "CREATE", kind: "CARISMA", mode: "OFFICIAL" })}>Sorteio oficial do Carisma</button>
      </div>

      {active?.mode === "REHEARSAL" ? (
        <button disabled={busy} className="button draw-reset-button" onClick={() => post({ action: "RESET_REHEARSAL", sessionId: active.id })}>
          Reiniciar ensaio
        </button>
      ) : null}

      {message ? <p className="error-inline">{message}</p> : null}
    </section>
  ) : null;

  return <div className="draw-experience">
    <div className={`draw-command-layout ${admin ? "admin-mode" : "public-mode"} ${active?.kind === "GROUPS" ? "with-groups" : "carisma-draw"}`}>
      {adminControls}

      <section className="draw-stage card">
        <header>
          <div><div className="eyebrow">Sorteio ao vivo</div><h2>{active?.title ?? "Nenhum sorteio criado"}</h2><p>{active ? `${active.mode === "OFFICIAL" ? "Oficial" : "Ensaio"} · ${active.status}` : "O administrador ainda não iniciou uma sessão."}</p></div>
          {sessions.length ? <select className="input" value={active?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title} · {session.mode === "OFFICIAL" ? "oficial" : "ensaio"}</option>)}</select> : null}
        </header>
        <div className={`draw-cage ${isSpinning ? "spinning" : ""}`}><div className="draw-cage-ring">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</div><div className="draw-chute">▼</div></div>
        <div className="draw-reveal">
          {latest?.kind === "GROUP_ASSIGNMENT" ? <><span className="draw-result-label">Grupo {latest.groupId}</span><PersonAvatar name={latest.participantName} url={latest.avatarUrl} type={latest.participantType} className="draw-main-avatar"/><h3>{latest.participantName}</h3><p>Posição {latest.slot} do grupo</p></> : null}
          {latest?.kind === "CARISMA_ASSIGNMENT" ? <><span className="draw-result-label">Pote {latest.pot}</span><CountryFlag iso2={latest.teamIso2} name={latest.teamName} className="draw-team-flag"/><h3>{latest.teamName}</h3><p>Time Carisma de {latest.participantName}</p></> : null}
          {!latest ? <><span className="draw-avatar-fallback">?</span><h3>Aguardando a primeira bolinha</h3><p>Todos os participantes conectados verão a revelação quase em tempo real.</p></> : null}
        </div>
        {active ? <div className="draw-progress"><div style={{ width: `${Math.max(0, ((active.currentIndex + 1) / active.events.length) * 100)}%` }}/><span>{Math.max(0, active.currentIndex + 1)} de {active.events.length}</span></div> : null}
      </section>

      {active?.kind === "GROUPS" ? <GroupBoard revealed={revealed} latest={latest} /> : null}
    </div>

    {active?.kind === "CARISMA" ? <CarismaBoard allEvents={active.events} revealed={revealed} latest={latest} /> : null}

    <div className="draw-lower-grid">
      <section className="card draw-history"><div className="eyebrow">Revelações</div><h3>Histórico do sorteio</h3><div>{[...revealed].reverse().slice(0, 24).map((event: any) => <article key={`${event.kind}-${event.index}`}><b>{event.index + 1}</b><span>{event.kind === "GROUP_ASSIGNMENT" ? event.participantName : event.teamName}<small>{event.kind === "GROUP_ASSIGNMENT" ? `Grupo ${event.groupId}` : `${event.participantName} · Pote ${event.pot}`}</small></span></article>)}</div></section>
    </div>
  </div>;
}
