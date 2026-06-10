import type { ScoreInput, ScoringResult } from "@/types/domain";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";

export type ScoringParticipantType = "HUMAN" | "BOT";

export interface MatchGuessCandidate {
  participantId: string;
  participantName: string;
  participantType: ScoringParticipantType;
  slot: number;
  guess: ScoreInput;
  carismaTeamId?: string;
}

export interface ScoredMatchGuess extends MatchGuessCandidate {
  result: ScoringResult;
  baseCode: string;
  basicPoints: number;
  carismaPoints: number;
  uniquenessBonus: number;
  isExact: boolean;
}

export interface MatchScoringInput {
  actual: ScoreInput;
  homeTeamId: string;
  awayTeamId: string;
  guesses: MatchGuessCandidate[];
}

function addBonus(
  scored: ScoredMatchGuess,
  code: "BONUS_SOLO_TOTAL" | "BONUS_SOLO_PARTIAL",
  points: 30 | 15,
  label: string
): ScoredMatchGuess {
  return {
    ...scored,
    uniquenessBonus: points,
    result: {
      total: scored.result.total + points,
      components: [
        ...scored.result.components,
        { code, points, label }
      ]
    }
  };
}

export function calculateMatchScores(input: MatchScoringInput): ScoredMatchGuess[] {
  const scored = input.guesses.map<ScoredMatchGuess>((candidate) => {
    const result = calculateScoreWithCarisma({
      guess: candidate.guess,
      actual: input.actual,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      carismaTeamId: candidate.carismaTeamId
    });
    const base = result.components[0];
    const carisma = result.components.find((component) => component.code === "CARISMA_MULTIPLIER");
    return {
      ...candidate,
      result,
      baseCode: base?.code ?? "BASE_MISS",
      basicPoints: base?.points ?? 0,
      carismaPoints: carisma?.points ?? 0,
      uniquenessBonus: 0,
      isExact: base?.code === "BASE_EXACT_SCORE"
    };
  });

  // A exclusividade é apurada entre todos os 16 participantes. Humanos e bots
  // contam na comparação e ambos podem receber os bônus de acerto sozinho.
  // O agrupamento por participante também garante que os dois slots da Wild Card
  // sejam tratados como uma única participação na partida.
  const byParticipant = new Map<string, ScoredMatchGuess[]>();
  for (const row of scored) {
    const rows = byParticipant.get(row.participantId) ?? [];
    rows.push(row);
    byParticipant.set(row.participantId, rows);
  }

  const scorers = [...byParticipant.entries()]
    .filter(([, rows]) => rows.some((row) => row.basicPoints > 0))
    .map(([participantId]) => participantId);
  const exactScorers = [...byParticipant.entries()]
    .filter(([, rows]) => rows.some((row) => row.isExact))
    .map(([participantId]) => participantId);

  const uniqueScorerId = scorers.length === 1 ? scorers[0] : null;
  const uniqueExactId = exactScorers.length === 1 ? exactScorers[0] : null;
  if (!uniqueScorerId && !uniqueExactId) return scored;

  const updated = [...scored];
  for (const [participantId, participantRows] of byParticipant) {
    const hasExact = participantRows.some((row) => row.isExact);
    let code: "BONUS_SOLO_TOTAL" | "BONUS_SOLO_PARTIAL" | null = null;
    let points: 30 | 15 | 0 = 0;
    let label = "";

    if (uniqueScorerId === participantId && uniqueExactId === participantId) {
      code = "BONUS_SOLO_TOTAL";
      points = 30;
      label = "Acerto sozinho total";
    } else if (uniqueScorerId === participantId && !hasExact) {
      code = "BONUS_SOLO_PARTIAL";
      points = 15;
      label = "Acerto sozinho parcial · único participante a pontuar";
    } else if (uniqueExactId === participantId && scorers.length > 1) {
      code = "BONUS_SOLO_PARTIAL";
      points = 15;
      label = "Acerto sozinho parcial · único participante no placar exato";
    }

    if (!code || points === 0) continue;

    const target = hasExact
      ? [...participantRows].filter((row) => row.isExact).sort((a, b) => a.slot - b.slot)[0]
      : [...participantRows].sort((a, b) => b.result.total - a.result.total || a.slot - b.slot)[0];
    if (!target) continue;
    const index = updated.findIndex(
      (row) => row.participantId === participantId && row.slot === target.slot
    );
    if (index >= 0) updated[index] = addBonus(updated[index]!, code, points, label);
  }

  return updated;
}
