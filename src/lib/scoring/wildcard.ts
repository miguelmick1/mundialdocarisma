import type { ScoringResult } from "@/types/domain";

export function bestOfWildcard(results: ScoringResult[]): ScoringResult {
  if (results.length === 0) throw new Error("Nenhum palpite fornecido");
  return results.reduce((best, current) => current.total > best.total ? current : best);
}
