"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import CountryFlag from "@/components/CountryFlag";

type EventRow = any;
type Session = { id: string; kind: "GROUPS" | "CARISMA"; mode: "REHEARSAL" | "OFFICIAL"; status: string; currentIndex: number; events: EventRow[]; title: string };

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
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/draws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
      if (data.sessionId) setSelectedId(data.sessionId);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro"); }
    finally { setBusy(false); }
  }

  return <div className="draw-page-grid">
    <section className="draw-stage card">
      <header><div><div className="eyebrow">Sorteio ao vivo</div><h2>{active?.title ?? "Nenhum sorteio criado"}</h2><p>{active ? `${active.mode === "OFFICIAL" ? "Oficial" : "Ensaio"} · ${active.status}` : "O administrador ainda não iniciou uma sessão."}</p></div>{sessions.length ? <select className="input" value={active?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title} · {session.mode === "OFFICIAL" ? "oficial" : "ensaio"}</option>)}</select> : null}</header>
      <div className={`draw-cage ${isSpinning ? "spinning" : ""}`}><div className="draw-cage-ring">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</div><div className="draw-chute">▼</div></div>
      <div className="draw-reveal">
        {latest?.kind === "GROUP_ASSIGNMENT" ? <><span className="draw-result-label">Grupo {latest.groupId}</span>{latest.avatarUrl ? <img src={latest.avatarUrl} alt="" /> : <span className="draw-avatar-fallback">{latest.participantType === "BOT" ? "🤖" : latest.participantName.slice(0, 1)}</span>}<h3>{latest.participantName}</h3><p>Posição {latest.slot} do grupo</p></> : null}
        {latest?.kind === "CARISMA_ASSIGNMENT" ? <><span className="draw-result-label">Pote {latest.pot}</span><CountryFlag iso2={latest.teamIso2} name={latest.teamName} className="draw-team-flag"/><h3>{latest.teamName}</h3><p>Time Carisma de {latest.participantName}</p></> : null}
        {!latest ? <><span className="draw-avatar-fallback">?</span><h3>Aguardando a primeira bolinha</h3><p>Todos os participantes conectados verão a revelação quase em tempo real.</p></> : null}
      </div>
      {active ? <div className="draw-progress"><div style={{ width: `${Math.max(0, ((active.currentIndex + 1) / active.events.length) * 100)}%` }}/><span>{Math.max(0, active.currentIndex + 1)} de {active.events.length}</span></div> : null}
    </section>

    <aside className="draw-side">
      {admin ? <section className="card draw-admin-controls"><div className="eyebrow">Controle do administrador</div><h3>Criar e conduzir</h3><div className="draw-admin-buttons"><button disabled={busy} className="button" onClick={() => post({ action: "CREATE", kind: "GROUPS", mode: "REHEARSAL" })}>Ensaio dos grupos</button><button disabled={busy} className="button button-primary" onClick={() => post({ action: "CREATE", kind: "GROUPS", mode: "OFFICIAL" })}>Sorteio oficial dos grupos</button><button disabled={busy} className="button" onClick={() => post({ action: "CREATE", kind: "CARISMA", mode: "REHEARSAL" })}>Ensaio do Carisma</button><button disabled={busy} className="button button-yellow" onClick={() => post({ action: "CREATE", kind: "CARISMA", mode: "OFFICIAL" })}>Sorteio oficial do Carisma</button></div>{active ? <><button disabled={busy || active.status === "COMPLETED"} className="button button-primary draw-next-button" onClick={() => post({ action: "REVEAL_NEXT", sessionId: active.id })}>Retirar próxima bolinha</button>{active.mode === "REHEARSAL" ? <button disabled={busy} className="button" onClick={() => post({ action: "RESET_REHEARSAL", sessionId: active.id })}>Reiniciar ensaio</button> : null}</> : null}{message ? <p className="error-inline">{message}</p> : null}</section> : null}
      <section className="card draw-history"><div className="eyebrow">Revelações</div><h3>Resultado parcial</h3><div>{[...revealed].reverse().slice(0, 20).map((event: any) => <article key={`${event.kind}-${event.index}`}><b>{event.index + 1}</b><span>{event.kind === "GROUP_ASSIGNMENT" ? event.participantName : event.teamName}<small>{event.kind === "GROUP_ASSIGNMENT" ? `Grupo ${event.groupId}` : `${event.participantName} · Pote ${event.pot}`}</small></span></article>)}</div></section>
    </aside>
  </div>;
}
