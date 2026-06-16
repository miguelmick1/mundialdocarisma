import { config } from "dotenv";
config({ path: ".env.local" });

import type { MatchScoreRepairChange } from "../src/lib/scoring/recalculate-match";

function formatChange(change: MatchScoreRepairChange) {
  const before = change.before ? `${change.before.totalPoints} pts / ${change.before.baseCode}` : "ausente";
  const after = change.after ? `${change.after.totalPoints} pts / ${change.after.baseCode}` : "removido";
  return `  - ${change.participantName} (slot ${change.slot}) [${change.kind}]: ${before} -> ${after}`;
}

async function main() {
  const { adminDb } = await import("../src/lib/firebase/admin");
  const {
    previewRecalculatedConfirmedMatchScores,
    recalculateConfirmedMatchScores,
  } = await import("../src/lib/scoring/recalculate-match");
  const apply = process.argv.includes("--apply");
  const requestedMatchIds = process.argv
    .filter((arg) => arg.startsWith("--match="))
    .map((arg) => arg.slice("--match=".length))
    .filter(Boolean);

  const matches: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  if (requestedMatchIds.length) {
    const docs = await adminDb.getAll(
      ...requestedMatchIds.map((matchId) => adminDb.collection("matches").doc(matchId)),
    );
    docs.forEach((doc) => {
      if (!doc.exists) return;
      matches.push({ id: doc.id, data: doc.data()! });
    });
  } else {
    const snap = await adminDb.collection("matches").get();
    snap.docs.forEach((doc) => {
      matches.push({ id: doc.id, data: doc.data() });
    });
  }

  const matchIds = matches
    .filter(({ data }) => data.status === "FINISHED" || data.scoringStatus === "CALCULATED")
    .map(({ id }) => id);

  const changedMatches: Array<{
    matchId: string;
    matchNumber: number;
    teams: string;
    actual: { home: number | null; away: number | null } | undefined;
    changes: MatchScoreRepairChange[];
  }> = [];

  for (const matchId of matchIds) {
    const preview = await previewRecalculatedConfirmedMatchScores(matchId);
    if (!preview.applies || !preview.changes.length) continue;

    const matchSnap = await adminDb.collection("matches").doc(matchId).get();
    const match = matchSnap.data()!;
    changedMatches.push({
      matchId,
      matchNumber: Number(match.matchNumber ?? 0),
      teams: `${match.homeTeamName ?? match.homeTeamId ?? "Mandante"} x ${match.awayTeamName ?? match.awayTeamId ?? "Visitante"}`,
      actual: preview.actual,
      changes: preview.changes.sort((a, b) => a.participantName.localeCompare(b.participantName, "pt-BR") || a.slot - b.slot),
    });
  }

  if (!changedMatches.length) {
    console.log("Nenhuma divergência encontrada entre os scoreEvents ativos e o recálculo corrigido.");
    return;
  }

  console.log(`${apply ? "Aplicando" : "Simulando"} reparo em ${changedMatches.length} partida(s) com divergência:`);
  for (const match of changedMatches) {
    const actual = match.actual ? `${match.actual.home} x ${match.actual.away}` : "placar indisponível";
    console.log(`\nJogo ${match.matchNumber} [${match.matchId}] - ${match.teams} - placar considerado: ${actual}`);
    match.changes.forEach((change) => console.log(formatChange(change)));
  }

  if (!apply) {
    console.log("\nDry-run concluído. Reexecute com --apply para gravar os reparos.");
    return;
  }

  for (const match of changedMatches) {
    await recalculateConfirmedMatchScores(match.matchId, "REPAIR_CONFIRMED_MATCH_RECALCULATION");
  }
  console.log(`\nReparo aplicado em ${changedMatches.length} partida(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
