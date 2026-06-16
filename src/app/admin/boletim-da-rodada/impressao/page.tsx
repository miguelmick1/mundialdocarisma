import { redirect } from "next/navigation";
import RoundBulletinPrintClient from "@/components/RoundBulletinPrintClient";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";
import { loadPrintRoundBulletin } from "@/lib/bulletin/round-bulletin-server";
import { parseBulletinRound } from "@/lib/bulletin/round-bulletin";

export default async function RoundBulletinPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ roundId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/dashboard");

  const params = await searchParams;
  const roundId = parseBulletinRound(params.roundId);
  if (!roundId) redirect("/admin/boletim-da-rodada");

  const payload = await loadPrintRoundBulletin(roundId);

  return <RoundBulletinPrintClient
    competitionTitle={payload.heading.competitionTitle}
    bulletinTitle={payload.heading.bulletinTitle}
    fields={payload.fields}
    publishedAt={payload.publication?.publishedAt ?? null}
  />;
}
