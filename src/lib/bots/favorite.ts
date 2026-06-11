import { hmacSha256 } from "@/lib/utils/hash";

export type FavoriteResolution = {
  side: "HOME" | "AWAY";
  method: "EXPLICIT_MATCH_CONFIG" | "CARISMA_POT" | "DETERMINISTIC_TIEBREAK";
  explanation: string;
  homePot: number | null;
  awayPot: number | null;
};

function validPot(value: unknown): number | null {
  const pot = Number(value);
  return Number.isInteger(pot) && pot >= 1 && pot <= 3 ? pot : null;
}

export function resolvePangareFavoriteSide(params: {
  matchId: string;
  secret: string;
  match: Record<string, unknown>;
  homeTeam?: Record<string, unknown>;
  awayTeam?: Record<string, unknown>;
}): FavoriteResolution {
  const explicit = params.match.pangareFavoriteSide ?? params.match.favoriteSide;
  const homePot = validPot(params.homeTeam?.carismaPot);
  const awayPot = validPot(params.awayTeam?.carismaPot);

  if (explicit === "HOME" || explicit === "AWAY") {
    return {
      side: explicit,
      method: "EXPLICIT_MATCH_CONFIG",
      explanation: `O favorito foi definido diretamente no cadastro da partida como ${explicit === "HOME" ? "mandante" : "visitante"}.`,
      homePot,
      awayPot,
    };
  }

  if (homePot !== null && awayPot !== null && homePot !== awayPot) {
    const side = homePot < awayPot ? "HOME" : "AWAY";
    return {
      side,
      method: "CARISMA_POT",
      explanation: `Foi considerado favorito o time do pote de força mais alto: mandante no pote ${homePot} e visitante no pote ${awayPot}.`,
      homePot,
      awayPot,
    };
  }

  const digest = hmacSha256(params.secret, `${params.matchId}:PANGARE:FAVORITE:1.0.0`);
  const side = Number.parseInt(digest.slice(0, 8), 16) % 2 === 0 ? "HOME" : "AWAY";
  const potText = homePot === null || awayPot === null
    ? "um ou ambos os times ainda não tinham pote de força válido"
    : `os dois times estavam no mesmo pote (${homePot})`;
  return {
    side,
    method: "DETERMINISTIC_TIEBREAK",
    explanation: `Como ${potText}, o favorito foi definido por desempate determinístico e auditável para esta partida.`,
    homePot,
    awayPot,
  };
}
