import { roundLabel, type CarismaRoundId, isCarismaRound } from "@/lib/world-cup/rounds";
import type { RoundSummary, RoundParticipantRow, RoundCell } from "@/lib/competition/round-insights";

export const BULLETIN_FIELD_ORDER = [
  "topScorers",
  "bestBet",
  "honorableMention",
  "blunder",
  "sureThing",
  "gauntlet",
  "highlights",
  "audacityAward",
] as const;

export type BulletinFieldKey = (typeof BULLETIN_FIELD_ORDER)[number];

export type BulletinFields = Record<BulletinFieldKey, string>;

export const BULLETIN_FIELD_LABELS: Record<BulletinFieldKey, string> = {
  topScorers: "Maiores pontuadores (sem contar bônus)",
  bestBet: "Melhor aposta",
  honorableMention: "Menção honrosa",
  blunder: "Presepada",
  sureThing: "Barbada",
  gauntlet: "Pedreira",
  highlights: "Highlights",
  audacityAward: "Prêmio ousadia",
};

function matchLabel(match: RoundSummary["matches"][number]) {
  const score = match.homeScore != null && match.awayScore != null
    ? `${match.homeScore} x ${match.awayScore}`
    : "x";
  return `${match.homeTeamName} ${score} ${match.awayTeamName}`;
}

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function formatScore(points: number) {
  return `${points} ${points === 1 ? "ponto" : "pontos"}`;
}

function topLines(rows: string[], fallback: string, limit = 3) {
  return rows.length ? rows.slice(0, limit).join("\n") : fallback;
}

function rankingByBasePoints(participants: RoundParticipantRow[]) {
  const scored = participants
    .filter((participant) => participant.totalBasePoints > 0)
    .sort((a, b) => (
      b.totalBasePoints - a.totalBasePoints ||
      b.exactHits - a.exactHits ||
      a.displayName.localeCompare(b.displayName, "pt-BR")
    ));

  const lines: string[] = [];
  let index = 0;
  let position = 1;
  while (index < scored.length && lines.length < 3) {
    const score = scored[index]!.totalBasePoints;
    const tied = scored.filter((participant) => participant.totalBasePoints === score);
    const names = tied.map((participant) => participant.displayName).join(", ");
    lines.push(`${position}) ${names} (${formatScore(score)})`);
    index += tied.length;
    position += tied.length;
  }
  return lines;
}

function cells(summary: RoundSummary) {
  return summary.matches.flatMap((match, matchIndex) =>
    summary.participants.map((participant) => ({
      match,
      participant,
      cell: participant.cells[matchIndex]!,
    })),
  );
}

function bestBetLines(summary: RoundSummary) {
  const best = cells(summary)
    .filter((row) => row.cell.points != null && row.cell.points > 0 && row.cell.guesses.length > 0 && row.match.resultCalculated && !row.match.isVoid)
    .sort((a, b) => (
      (b.cell.points ?? 0) - (a.cell.points ?? 0) ||
      Number(b.cell.baseCode === "BASE_EXACT_SCORE") - Number(a.cell.baseCode === "BASE_EXACT_SCORE") ||
      a.participant.displayName.localeCompare(b.participant.displayName, "pt-BR")
    ));

  if (!best.length) return "Nenhuma aposta pontuada nesta rodada ainda.";

  const top = best[0]!;
  const notes: string[] = [];
  if (top.cell.isOnlyExact) notes.push("único acerto exato");
  if (top.cell.isOnlyScorer) notes.push("único a pontuar");
  return `${top.participant.displayName} - ${matchLabel(top.match)} (${formatScore(top.cell.points ?? 0)}${notes.length ? `, ${notes.join(", ")}` : ""})`;
}

function honorableMentionLines(summary: RoundSummary) {
  const candidates = cells(summary)
    .filter((row) => row.match.resultCalculated && !row.match.isVoid && row.cell.points != null && row.cell.points > 0)
    .filter((row) => row.cell.isOnlyScorer || row.cell.isOnlyExact)
    .sort((a, b) => (
      (b.cell.points ?? 0) - (a.cell.points ?? 0) ||
      a.participant.displayName.localeCompare(b.participant.displayName, "pt-BR")
    ));

  return topLines(
    candidates.map((row) => {
      const reasons = [];
      if (row.cell.isOnlyScorer) reasons.push("único a pontuar");
      if (row.cell.isOnlyExact) reasons.push("único acerto exato");
      return `${row.participant.displayName} - ${matchLabel(row.match)} (${formatScore(row.cell.points ?? 0)}, ${reasons.join(" e ")})`;
    }),
    "Nenhuma menção honrosa automática nesta rodada.",
  );
}

function blunderLines(summary: RoundSummary) {
  const noGuess = summary.participants.filter((participant) => participant.guessedMatches === 0);
  const lines: string[] = [];
  if (noGuess.length) {
    lines.push(`Não apostaram na rodada: ${noGuess.map((participant) => participant.displayName).join(", ")}`);
  }

  const onlyZero = cells(summary)
    .filter((row) => row.match.resultCalculated && !row.match.isVoid && row.cell.isOnlyZero)
    .sort((a, b) => a.participant.displayName.localeCompare(b.participant.displayName, "pt-BR"));

  onlyZero.slice(0, 3).forEach((row) => {
    lines.push(`${row.participant.displayName} - ${matchLabel(row.match)} (único a não pontuar)`);
  });

  return topLines(lines, "Nenhuma presepada automática nesta rodada.", 4);
}

function sureThingLines(summary: RoundSummary) {
  const rows = summary.matches
    .filter((match) => match.resultCalculated && !match.isVoid)
    .filter((match, matchIndex) => summary.participants.every((participant) => (participant.cells[matchIndex]?.points ?? 0) > 0))
    .map((match) => matchLabel(match));
  return topLines(rows, "Nenhuma barbada automática nesta rodada.");
}

function gauntletLines(summary: RoundSummary) {
  const rows = summary.matches
    .filter((match) => match.resultCalculated && !match.isVoid)
    .filter((match, matchIndex) => summary.participants.every((participant) => (participant.cells[matchIndex]?.points ?? 0) === 0))
    .map((match) => matchLabel(match));
  return topLines(rows, "Nenhuma pedreira automática nesta rodada.");
}

function highlightLines(summary: RoundSummary) {
  const averageByMatch = summary.matches
    .map((match, matchIndex) => ({
      match,
      average: summary.participants.length
        ? Number((summary.participants.reduce((sum, participant) => sum + (participant.cells[matchIndex]?.points ?? 0), 0) / summary.participants.length).toFixed(2))
        : 0,
      exactHits: summary.participants.filter((participant) => participant.cells[matchIndex]?.baseCode === "BASE_EXACT_SCORE").length,
    }))
    .filter((row) => row.match.resultCalculated && !row.match.isVoid);

  const bestAverage = [...averageByMatch].sort((a, b) => b.average - a.average)[0];
  const bestExacts = [...averageByMatch].sort((a, b) => b.exactHits - a.exactHits || b.average - a.average)[0];
  const totalScorers = summary.participants.filter((participant) => participant.scoredMatches > 0).length;
  const lines: string[] = [];
  if (bestAverage) {
    lines.push(`${matchLabel(bestAverage.match)} teve média de ${bestAverage.average.toLocaleString("pt-BR")} pontos por participante.`);
  }
  if (bestExacts && bestExacts.exactHits > 0) {
    lines.push(`${matchLabel(bestExacts.match)} rendeu ${bestExacts.exactHits} acerto(s) exato(s).`);
  }
  lines.push(`${totalScorers} participante(s) pontuaram ao menos uma vez na rodada.`);
  return topLines(lines, "Sem highlights automáticos por enquanto.");
}

function audacityLines(summary: RoundSummary) {
  const candidates = cells(summary)
    .filter((row) => row.match.resultCalculated && !row.match.isVoid && row.cell.points != null && row.cell.points > 0 && row.cell.audacityScore != null)
    .sort((a, b) => (
      (b.cell.audacityScore ?? 0) - (a.cell.audacityScore ?? 0) ||
      (b.cell.points ?? 0) - (a.cell.points ?? 0)
    ));

  return topLines(
    candidates.map((row) => `${row.participant.displayName} - ${matchLabel(row.match)} (${formatScore(row.cell.points ?? 0)}, fugindo da média dos palpites)`),
    "Nenhum prêmio ousadia automático nesta rodada.",
  );
}

export function emptyBulletinFields(): BulletinFields {
  return {
    topScorers: "",
    bestBet: "",
    honorableMention: "",
    blunder: "",
    sureThing: "",
    gauntlet: "",
    highlights: "",
    audacityAward: "",
  };
}

export function normalizeBulletinFields(value: Partial<Record<BulletinFieldKey, string>> | null | undefined) {
  const fields = emptyBulletinFields();
  for (const key of BULLETIN_FIELD_ORDER) {
    const candidate = value?.[key];
    fields[key] = typeof candidate === "string" ? candidate.trim() : "";
  }
  return fields;
}

export function buildBulletinSuggestions(summary: RoundSummary): BulletinFields {
  return {
    topScorers: topLines(rankingByBasePoints(summary.participants), "Nenhum participante pontuou sem bônus nesta rodada."),
    bestBet: oneLine(bestBetLines(summary)),
    honorableMention: honorableMentionLines(summary),
    blunder: blunderLines(summary),
    sureThing: sureThingLines(summary),
    gauntlet: gauntletLines(summary),
    highlights: highlightLines(summary),
    audacityAward: audacityLines(summary),
  };
}

export function bulletinHeading(roundId: CarismaRoundId) {
  return {
    competitionTitle: "Mundial Snickers do Carisma 2026",
    bulletinTitle: `Boletim - ${roundLabel(roundId)}`,
  };
}

export function parseBulletinRound(value: string | null | undefined): CarismaRoundId | null {
  return value && isCarismaRound(value) ? value : null;
}
