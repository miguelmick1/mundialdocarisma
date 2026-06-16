"use client";

import { useEffect, useState } from "react";
import RoundBulletinBoard from "@/components/RoundBulletinBoard";
import {
  BULLETIN_FIELD_LABELS,
  BULLETIN_FIELD_ORDER,
  emptyBulletinFields,
  type BulletinFields,
} from "@/lib/bulletin/round-bulletin";

type RoundOption = {
  id: string;
  label: string;
  matchCount: number;
  calculatedCount: number;
};

type BulletinResponse = {
  rounds: RoundOption[];
  selectedRoundId: string;
  heading: {
    competitionTitle: string;
    bulletinTitle: string;
  };
  suggestions: BulletinFields;
  draft: {
    fields: BulletinFields;
    updatedAt: string | null;
  };
  publication: {
    publicationId: string;
    publishedAt: string | null;
    fields: BulletinFields;
  } | null;
};

const INITIAL_RESPONSE: BulletinResponse = {
  rounds: [],
  selectedRoundId: "GROUP_1",
  heading: {
    competitionTitle: "Mundial Snickers do Carisma 2026",
    bulletinTitle: "Boletim",
  },
  suggestions: emptyBulletinFields(),
  draft: {
    fields: emptyBulletinFields(),
    updatedAt: null,
  },
  publication: null,
};

export default function RoundBulletinAdminClient() {
  const [payload, setPayload] = useState<BulletinResponse>(INITIAL_RESPONSE);
  const [roundId, setRoundId] = useState("GROUP_1");
  const [fields, setFields] = useState<BulletinFields>(emptyBulletinFields());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(nextRoundId?: string) {
    setLoading(true);
    setError("");
    try {
      const target = nextRoundId ?? roundId;
      const response = await fetch(`/api/admin/round-bulletin?roundId=${encodeURIComponent(target)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar boletim");
      setPayload(data);
      setRoundId(data.selectedRoundId);
      setFields(data.draft.fields);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar boletim");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("GROUP_1");
  }, []);

  async function persist(action: "SAVE" | "PUBLISH") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/round-bulletin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, action, fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar boletim");
      setMessage(action === "PUBLISH" ? "Boletim enviado para todos os participantes." : "Rascunho salvo.");
      await load(roundId);
      return { ok: true, publicationId: data.publicationId as string | undefined };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao salvar boletim");
      return { ok: false, publicationId: undefined };
    } finally {
      setSaving(false);
    }
  }

  async function openPrintView() {
    const result = await persist("SAVE");
    if (!result.ok) return;
    window.open(`/admin/boletim-da-rodada/impressao?roundId=${encodeURIComponent(roundId)}`, "_blank", "noopener,noreferrer");
  }

  if (loading) return <section className="card">Carregando o boletim da rodada...</section>;

  return <div className="round-bulletin-admin-shell">
    <section className="card round-bulletin-toolbar">
      <div>
        <div className="eyebrow">Boletim modular</div>
        <h3>Montar e disparar o boletim da rodada</h3>
        <p className="muted">As sugestões abaixo são calculadas automaticamente, mas cada campo pode ser editado livremente antes do envio.</p>
      </div>
      <div className="round-bulletin-toolbar-actions">
        <label>
          Rodada
          <select className="input" value={roundId} onChange={(event) => void load(event.target.value)}>
            {payload.rounds.map((round) => <option key={round.id} value={round.id}>{round.label} · {round.matchCount} jogo(s)</option>)}
          </select>
        </label>
        <button type="button" className="button" onClick={() => void persist("SAVE")} disabled={saving}>{saving ? "Salvando..." : "Salvar rascunho"}</button>
        <button type="button" className="button button-secondary" onClick={openPrintView} disabled={saving}>Gerar PDF</button>
        <button type="button" className="button button-primary" onClick={() => void persist("PUBLISH")} disabled={saving}>Enviar para todos os participantes</button>
      </div>
      {payload.draft.updatedAt ? <small className="muted">Último rascunho salvo em {new Date(payload.draft.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small> : null}
      {payload.publication?.publishedAt ? <small className="muted">Último envio em {new Date(payload.publication.publishedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small> : null}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>

    <div className="round-bulletin-admin-layout">
      <section className="card round-bulletin-editor-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Editor</div>
            <h3>Campos do boletim</h3>
          </div>
        </div>
        <div className="round-bulletin-editor-grid">
          {BULLETIN_FIELD_ORDER.map((field) => <article key={field}>
            <div>
              <strong>{BULLETIN_FIELD_LABELS[field]}</strong>
              <button type="button" className="button button-small" onClick={() => setFields((current) => ({ ...current, [field]: payload.suggestions[field] }))}>
                Restaurar sugestão
              </button>
            </div>
            <textarea
              className="input round-bulletin-textarea"
              value={fields[field]}
              onChange={(event) => setFields((current) => ({ ...current, [field]: event.target.value }))}
              rows={field === "highlights" ? 5 : 4}
            />
          </article>)}
        </div>
      </section>

      <section className="card round-bulletin-preview-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Prévia</div>
            <h3>Como o boletim vai aparecer</h3>
          </div>
        </div>
        <RoundBulletinBoard
          competitionTitle={payload.heading.competitionTitle}
          bulletinTitle={payload.heading.bulletinTitle}
          fields={fields}
          publishedAt={payload.publication?.publishedAt ?? null}
        />
      </section>
    </div>
  </div>;
}
