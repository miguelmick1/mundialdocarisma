"use client";

import { useEffect, useState } from "react";
import RoundBulletinBoard from "@/components/RoundBulletinBoard";
import type { BulletinFields } from "@/lib/bulletin/round-bulletin";

type BulletinPayload = {
  roundId: string;
  publicationId: string;
  publishedAt: string | null;
  heading: {
    competitionTitle: string;
    bulletinTitle: string;
  };
  fields: BulletinFields;
};

export default function RoundBulletinInbox() {
  const [bulletin, setBulletin] = useState<BulletinPayload | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    fetch("/api/round-bulletin/current", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Falha ao carregar boletim");
        setBulletin(data.bulletin ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function closeBulletin() {
    if (!bulletin || closing) return;
    setClosing(true);
    try {
      await fetch("/api/round-bulletin/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId: bulletin.publicationId }),
      });
    } finally {
      setBulletin(null);
      setClosing(false);
    }
  }

  if (!bulletin) return null;

  return <div className="round-bulletin-modal-backdrop" role="presentation" onMouseDown={closeBulletin}>
    <section className="round-bulletin-modal" role="dialog" aria-modal="true" aria-labelledby="round-bulletin-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div>
          <div className="eyebrow">Boletim da rodada</div>
          <h3 id="round-bulletin-title">Recado novo do Mundial</h3>
          <p className="muted">Este boletim vai aparecer só uma vez para você.</p>
        </div>
        <button type="button" aria-label="Fechar" onClick={closeBulletin}>×</button>
      </header>
      <RoundBulletinBoard
        competitionTitle={bulletin.heading.competitionTitle}
        bulletinTitle={bulletin.heading.bulletinTitle}
        fields={bulletin.fields}
        publishedAt={bulletin.publishedAt}
      />
      <footer>
        <button type="button" className="button button-primary" onClick={closeBulletin} disabled={closing}>
          {closing ? "Fechando..." : "Fechar boletim"}
        </button>
      </footer>
    </section>
  </div>;
}
