export type TeamColors = { primary: string; secondary: string; text: string };

const TEAM_COLORS: Record<string, TeamColors> = {
  ALG: { primary: "#006233", secondary: "#FFFFFF", text: "#073B25" },
  ARG: { primary: "#74ACDF", secondary: "#FFFFFF", text: "#123C63" },
  AUS: { primary: "#FFCD00", secondary: "#00843D", text: "#1F3A20" },
  AUT: { primary: "#ED2939", secondary: "#FFFFFF", text: "#5C1118" },
  BEL: { primary: "#E30613", secondary: "#FFD90C", text: "#3A1600" },
  BIH: { primary: "#002395", secondary: "#FECB00", text: "#172B66" },
  BRA: { primary: "#FFDF00", secondary: "#009C3B", text: "#173C22" },
  CAN: { primary: "#D80621", secondary: "#FFFFFF", text: "#5A111E" },
  CIV: { primary: "#F77F00", secondary: "#009E60", text: "#4C2D00" },
  COD: { primary: "#007FFF", secondary: "#CE1021", text: "#123963" },
  COL: { primary: "#FCD116", secondary: "#003893", text: "#3C3200" },
  CPV: { primary: "#003893", secondary: "#CF2027", text: "#17305F" },
  CRO: { primary: "#FF0000", secondary: "#171796", text: "#4C1010" },
  CUW: { primary: "#002B7F", secondary: "#F9E814", text: "#162B54" },
  CZE: { primary: "#D7141A", secondary: "#11457E", text: "#4D171A" },
  ECU: { primary: "#FFD100", secondary: "#0033A0", text: "#413700" },
  EGY: { primary: "#CE1126", secondary: "#FFFFFF", text: "#53141E" },
  ENG: { primary: "#FFFFFF", secondary: "#CF081F", text: "#2B2B2B" },
  ESP: { primary: "#AA151B", secondary: "#F1BF00", text: "#4C1518" },
  FRA: { primary: "#002395", secondary: "#EF4135", text: "#182E67" },
  GER: { primary: "#111111", secondary: "#DD0000", text: "#111111" },
  GHA: { primary: "#CE1126", secondary: "#FCD116", text: "#4F171E" },
  HAI: { primary: "#00209F", secondary: "#D21034", text: "#172E68" },
  IRN: { primary: "#239F40", secondary: "#DA0000", text: "#174628" },
  IRQ: { primary: "#CE1126", secondary: "#007A3D", text: "#51151D" },
  JOR: { primary: "#CE1126", secondary: "#007A3D", text: "#51151D" },
  JPN: { primary: "#BC002D", secondary: "#FFFFFF", text: "#4A1120" },
  KOR: { primary: "#CD2E3A", secondary: "#0047A0", text: "#4E1820" },
  KSA: { primary: "#006C35", secondary: "#FFFFFF", text: "#0E452A" },
  MAR: { primary: "#C1272D", secondary: "#006233", text: "#4D161A" },
  MEX: { primary: "#006847", secondary: "#CE1126", text: "#13432F" },
  NED: { primary: "#F36C21", secondary: "#21468B", text: "#543019" },
  NOR: { primary: "#BA0C2F", secondary: "#00205B", text: "#4C1421" },
  NZL: { primary: "#00247D", secondary: "#CC142B", text: "#172D59" },
  PAN: { primary: "#DA121A", secondary: "#005293", text: "#50171B" },
  PAR: { primary: "#D52B1E", secondary: "#0038A8", text: "#501811" },
  POR: { primary: "#046A38", secondary: "#DA291C", text: "#143F2A" },
  QAT: { primary: "#8A1538", secondary: "#FFFFFF", text: "#421528" },
  RSA: { primary: "#007A4D", secondary: "#FFB612", text: "#15432F" },
  SCO: { primary: "#005EB8", secondary: "#FFFFFF", text: "#173C65" },
  SEN: { primary: "#00853F", secondary: "#FDEF42", text: "#17432A" },
  SUI: { primary: "#D52B1E", secondary: "#FFFFFF", text: "#501811" },
  SWE: { primary: "#006AA7", secondary: "#FECC02", text: "#173C5B" },
  TUN: { primary: "#E70013", secondary: "#FFFFFF", text: "#551119" },
  TUR: { primary: "#E30A17", secondary: "#FFFFFF", text: "#541218" },
  URU: { primary: "#5BB5E9", secondary: "#FFFFFF", text: "#173D58" },
  USA: { primary: "#3C3B6E", secondary: "#B22234", text: "#252441" },
  UZB: { primary: "#1EB53A", secondary: "#0099B5", text: "#174427" },
};

function fallbackColors(teamId: string): TeamColors {
  let hash = 0;
  for (const char of teamId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return {
    primary: `hsl(${hue} 68% 42%)`,
    secondary: `hsl(${(hue + 48) % 360} 72% 60%)`,
    text: `hsl(${hue} 55% 24%)`,
  };
}

export function teamColors(teamId?: string | null): TeamColors {
  if (!teamId) return { primary: "#D9E4DC", secondary: "#F5F8F5", text: "#42544A" };
  return TEAM_COLORS[teamId.toUpperCase()] ?? fallbackColors(teamId.toUpperCase());
}
