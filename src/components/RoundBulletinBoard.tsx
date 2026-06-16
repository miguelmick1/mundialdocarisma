import {
  BULLETIN_FIELD_LABELS,
  BULLETIN_FIELD_ORDER,
  type BulletinFields,
} from "@/lib/bulletin/round-bulletin";

export default function RoundBulletinBoard({
  competitionTitle,
  bulletinTitle,
  fields,
  publishedAt,
}: {
  competitionTitle: string;
  bulletinTitle: string;
  fields: BulletinFields;
  publishedAt?: string | null;
}) {
  return <section className="round-bulletin-board">
    <header className="round-bulletin-header">
      <div>
        <strong>{competitionTitle}</strong>
        <h2>{bulletinTitle}</h2>
        {publishedAt ? <small>Publicado em {new Date(publishedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small> : <small>Rascunho editável</small>}
      </div>
      <div className="round-bulletin-emblem" aria-hidden="true">
        <span>2026</span>
      </div>
    </header>

    <div className="round-bulletin-grid">
      {BULLETIN_FIELD_ORDER.map((field) => <article key={field}>
        <h3>{BULLETIN_FIELD_LABELS[field]}</h3>
        <div>
          {(fields[field] || "Sem conteúdo definido.")
            .split("\n")
            .map((line, index) => <p key={`${field}-${index}`}>{line || " "}</p>)}
        </div>
      </article>)}
    </div>
  </section>;
}
