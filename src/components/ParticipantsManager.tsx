"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { prepareAvatarFile } from "@/lib/client/avatar-image";
import { competitionGroupLabel } from "@/lib/competition/group-names";

interface ParticipantRow {
  id: string;
  kind: "HUMAN" | "BOT";
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  avatarSource: string;
  googleAvatarUrl: string | null;
  groupId: string | null;
  carismaTeams: Array<{ id?: string; name?: string; iso2?: string; pot?: number }>;
}

export default function ParticipantsManager() {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [filter, setFilter] = useState<"ALL" | "HUMAN" | "BOT">("ALL");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/participants", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar participantes.");
    setRows(data.participants ?? []);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar."));
  }, []);

  const visible = useMemo(
    () => rows.filter((row) => filter === "ALL" || row.kind === filter),
    [rows, filter],
  );

  async function saveName(event: FormEvent, row: ParticipantRow) {
    event.preventDefault();
    setBusyId(row.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/participants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: row.id, participantKind: row.kind, displayName: row.displayName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o nome.");
      setMessage(`Nome de ${data.displayName} atualizado.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setBusyId("");
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, row: ParticipantRow) {
    const original = event.target.files?.[0];
    event.target.value = "";
    if (!original) return;
    setBusyId(row.id);
    setMessage("");
    setError("");
    try {
      const prepared = await prepareAvatarFile(original);
      const body = new FormData();
      body.set("participantId", row.id);
      body.set("participantKind", row.kind);
      body.set("file", prepared);
      const response = await fetch("/api/admin/participants/avatar", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar a foto.");
      setMessage(`Foto de ${row.displayName} atualizada.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar a foto.");
    } finally {
      setBusyId("");
    }
  }

  async function avatarAction(row: ParticipantRow, action: "USE_GOOGLE" | "REMOVE") {
    setBusyId(row.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/participants/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: row.id, participantKind: row.kind, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a foto.");
      setMessage(action === "USE_GOOGLE" ? "Foto do Google restaurada." : "Foto removida.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a foto.");
    } finally {
      setBusyId("");
    }
  }

  return <>
    <div className="participant-admin-toolbar">
      <div>
        <b>{rows.filter((row) => row.kind === "HUMAN").length}</b> humanos · <b>{rows.filter((row) => row.kind === "BOT").length}</b> bots
      </div>
      <div className="segmented-control">
        {(["ALL", "HUMAN", "BOT"] as const).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "ALL" ? "Todos" : item === "HUMAN" ? "Humanos" : "Bots"}</button>)}
      </div>
    </div>
    {error ? <p className="error">{error}</p> : null}
    {message ? <p className="success">{message}</p> : null}
    <div className="participant-admin-grid">
      {visible.map((row) => <article key={row.id} className="participant-admin-card">
        <div className="participant-admin-photo">
          {row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : <span>{row.kind === "BOT" ? "🤖" : row.displayName.slice(0, 1).toUpperCase()}</span>}
          <label className={`participant-photo-edit ${busyId === row.id ? "disabled" : ""}`} title="Escolher foto">
            📷
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload(event, row)} disabled={busyId === row.id} />
          </label>
        </div>
        <form onSubmit={(event) => saveName(event, row)}>
          <div className="participant-admin-meta"><span>{row.kind === "BOT" ? "Bot" : "Humano"}</span><b>{competitionGroupLabel(row.groupId)}</b></div>
          <input className="input participant-admin-name" value={row.displayName} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, displayName: event.target.value } : item))} minLength={2} maxLength={60} />
          {row.email ? <small className="muted participant-admin-email">{row.email}</small> : null}
          <div className="participant-carisma-mini">
            {row.carismaTeams.length ? row.carismaTeams.map((team, index) => <span key={`${team.id ?? team.name}-${index}`}>P{team.pot ?? index + 1} · {team.name ?? team.id}</span>) : <span>Times Carisma ainda não sorteados</span>}
          </div>
          <div className="participant-admin-actions">
            <button className="button button-primary" disabled={busyId === row.id}>{busyId === row.id ? "Salvando…" : "Salvar nome"}</button>
            {row.kind === "HUMAN" && row.googleAvatarUrl ? <button type="button" className="button" onClick={() => avatarAction(row, "USE_GOOGLE")} disabled={busyId === row.id}>Foto Google</button> : null}
            <button type="button" className="button" onClick={() => avatarAction(row, "REMOVE")} disabled={busyId === row.id || !row.avatarUrl}>Remover foto</button>
          </div>
        </form>
      </article>)}
    </div>
  </>;
}
