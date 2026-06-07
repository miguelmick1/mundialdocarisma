import type { Firestore } from "firebase-admin/firestore";
import { WORLD_CUP_TEAM_BY_ID } from "@/lib/world-cup/schedule";

export interface StandingRow {
  group: string;
  rank: number;
  teamId: string;
  teamName: string;
  iso2?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string | null;
  qualification?: string | null;
}

export interface StandingsPayload {
  groups: Record<string, StandingRow[]>;
  source: "API_FOOTBALL" | "LOCAL";
  sourceLabel: string;
  updatedAt: string;
  warning?: string;
}

type ApiFootballStanding = {
  rank: number;
  team: { id: number; name: string };
  points: number;
  goalsDiff: number;
  group: string;
  form?: string | null;
  description?: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
};

const API_NAME_TO_TEAM_ID: Record<string, string> = {
  Mexico: "MEX", "South Africa": "RSA", "South Korea": "KOR", "Czech Republic": "CZE",
  Canada: "CAN", "Bosnia and Herzegovina": "BIH", "Bosnia & Herzegovina": "BIH", Qatar: "QAT", Switzerland: "SUI",
  Brazil: "BRA", Morocco: "MAR", Haiti: "HAI", Scotland: "SCO", "USA": "USA", "United States": "USA",
  Paraguay: "PAR", Australia: "AUS", Turkey: "TUR", Germany: "GER", Curaçao: "CUW", Curacao: "CUW",
  "Ivory Coast": "CIV", Ecuador: "ECU", Netherlands: "NED", Japan: "JPN", Sweden: "SWE", Tunisia: "TUN",
  Belgium: "BEL", Egypt: "EGY", Iran: "IRN", "New Zealand": "NZL", Spain: "ESP", "Cape Verde": "CPV",
  "Saudi Arabia": "KSA", Uruguay: "URU", France: "FRA", Senegal: "SEN", Iraq: "IRQ", Norway: "NOR",
  Argentina: "ARG", Algeria: "ALG", Austria: "AUT", Jordan: "JOR", Portugal: "POR", "DR Congo": "COD",
  "Congo DR": "COD", Uzbekistan: "UZB", Colombia: "COL", England: "ENG", Croatia: "CRO", Ghana: "GHA", Panama: "PAN"
};

function emptyRow(teamId: string, group: string): StandingRow {
  const team = WORLD_CUP_TEAM_BY_ID.get(teamId);
  return {
    group,
    rank: 0,
    teamId,
    teamName: team?.name ?? teamId,
    iso2: team?.iso2,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: null,
    qualification: null
  };
}

function addResult(row: StandingRow, goalsFor: number, goalsAgainst: number) {
  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (goalsFor > goalsAgainst) {
    row.won += 1;
    row.points += 3;
  } else if (goalsFor === goalsAgainst) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

function rankGroups(groups: Record<string, StandingRow[]>) {
  for (const rows of Object.values(groups)) {
    rows.sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName, "pt-BR")
    );
    rows.forEach((row, index) => {
      row.rank = index + 1;
      row.qualification = index < 2 ? "Classificação direta" : index === 2 ? "Disputa entre terceiros" : null;
    });
  }
}

export async function calculateLocalStandings(store: Firestore): Promise<StandingsPayload> {
  const [teamsSnap, matchesSnap] = await Promise.all([
    store.collection("teams").get(),
    store.collection("matches").where("phase", "==", "GROUP_STAGE").get()
  ]);
  const groups: Record<string, StandingRow[]> = {};
  const rowsByTeam = new Map<string, StandingRow>();

  for (const doc of teamsSnap.docs) {
    const data = doc.data();
    const group = String(data.group ?? "");
    if (!group) continue;
    const row = emptyRow(doc.id, group);
    row.teamName = data.name ?? row.teamName;
    row.iso2 = data.iso2 ?? row.iso2;
    (groups[group] ??= []).push(row);
    rowsByTeam.set(doc.id, row);
  }

  for (const doc of matchesSnap.docs) {
    const match = doc.data();
    if (match.status !== "FINISHED") continue;
    const homeScore = Number(match.homeScore90);
    const awayScore = Number(match.awayScore90);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    const home = rowsByTeam.get(match.homeTeamId);
    const away = rowsByTeam.get(match.awayTeamId);
    if (!home || !away) continue;
    addResult(home, homeScore, awayScore);
    addResult(away, awayScore, homeScore);
  }

  rankGroups(groups);
  return {
    groups: Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))),
    source: "LOCAL",
    sourceLabel: "Classificação calculada a partir dos resultados cadastrados no Super Bolão",
    updatedAt: new Date().toISOString()
  };
}

export async function fetchApiFootballStandings(apiKey: string): Promise<StandingsPayload> {
  const response = await fetch("https://v3.football.api-sports.io/standings?league=1&season=2026", {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`API-Football respondeu ${response.status}`);
  const payload = (await response.json()) as {
    errors?: Record<string, string> | string[];
    response?: Array<{ league?: { standings?: ApiFootballStanding[][] } }>;
  };
  const errors = payload.errors;
  if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) {
    throw new Error(`API-Football: ${JSON.stringify(errors)}`);
  }
  const standingGroups = payload.response?.[0]?.league?.standings ?? [];
  if (!standingGroups.length) throw new Error("A API-Football não retornou a classificação.");
  const groups: Record<string, StandingRow[]> = {};
  for (const apiRows of standingGroups) {
    for (const apiRow of apiRows) {
      const group = apiRow.group.replace(/Group\s+/i, "");
      const teamId = API_NAME_TO_TEAM_ID[apiRow.team.name] ?? String(apiRow.team.id);
      const team = WORLD_CUP_TEAM_BY_ID.get(teamId);
      (groups[group] ??= []).push({
        group,
        rank: apiRow.rank,
        teamId,
        teamName: team?.name ?? apiRow.team.name,
        iso2: team?.iso2,
        played: apiRow.all.played,
        won: apiRow.all.win,
        drawn: apiRow.all.draw,
        lost: apiRow.all.lose,
        goalsFor: apiRow.all.goals.for,
        goalsAgainst: apiRow.all.goals.against,
        goalDifference: apiRow.goalsDiff,
        points: apiRow.points,
        form: apiRow.form ?? null,
        qualification: apiRow.description ?? null
      });
    }
  }
  return {
    groups: Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))),
    source: "API_FOOTBALL",
    sourceLabel: "API-Football · Copa do Mundo 2026",
    updatedAt: new Date().toISOString()
  };
}
