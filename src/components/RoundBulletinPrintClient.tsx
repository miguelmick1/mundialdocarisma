"use client";

import { useEffect } from "react";
import RoundBulletinBoard from "@/components/RoundBulletinBoard";
import type { BulletinFields } from "@/lib/bulletin/round-bulletin";

export default function RoundBulletinPrintClient({
  competitionTitle,
  bulletinTitle,
  fields,
  publishedAt,
}: {
  competitionTitle: string;
  bulletinTitle: string;
  fields: BulletinFields;
  publishedAt: string | null;
}) {
  useEffect(() => {
    window.print();
  }, []);

  return <main className="round-bulletin-print-page">
    <RoundBulletinBoard
      competitionTitle={competitionTitle}
      bulletinTitle={bulletinTitle}
      fields={fields}
      publishedAt={publishedAt}
    />
  </main>;
}
