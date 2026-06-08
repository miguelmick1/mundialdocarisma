import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { carismaRoundIdForMatch } from "@/lib/world-cup/rounds";

export const OPEN_FOOTBALL_SCHEDULE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
export const FIFA_FIXTURES_URL =
  "https://www.fifa.com/pt/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures";

export type WorldCupPhase =
  | "GROUP_STAGE"
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINAL"
  | "SEMI_FINAL"
  | "THIRD_PLACE"
  | "FINAL";

export interface WorldCupTeamInfo {
  id: string;
  name: string;
  englishName: string;
  iso2: string;
}

export interface WorldCupScheduleMatch {
  matchNumber: number;
  phase: WorldCupPhase;
  group?: string;
  groupRound?: 1 | 2 | 3;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamIso2?: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamIso2?: string;
  teamsResolved: boolean;
  kickoffAt: Date;
  venue: string;
  sourceUrl: string;
}

type OpenFootballMatch = {
  round: string;
  num?: number;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
};

type OpenFootballPayload = {
  name: string;
  matches: OpenFootballMatch[];
};

type ProvisionalMatch = Omit<WorldCupScheduleMatch, "matchNumber" | "groupRound"> & {
  sourceIndex: number;
  sourceNumber?: number;
};

const TEAM_BY_ENGLISH_NAME: Record<string, WorldCupTeamInfo> = {
  Mexico: { id: "MEX", name: "México", englishName: "Mexico", iso2: "MX" },
  "South Africa": { id: "RSA", name: "África do Sul", englishName: "South Africa", iso2: "ZA" },
  "South Korea": { id: "KOR", name: "Coreia do Sul", englishName: "South Korea", iso2: "KR" },
  "Czech Republic": { id: "CZE", name: "Tchéquia", englishName: "Czech Republic", iso2: "CZ" },
  Canada: { id: "CAN", name: "Canadá", englishName: "Canada", iso2: "CA" },
  "Bosnia & Herzegovina": { id: "BIH", name: "Bósnia e Herzegovina", englishName: "Bosnia & Herzegovina", iso2: "BA" },
  Qatar: { id: "QAT", name: "Catar", englishName: "Qatar", iso2: "QA" },
  Switzerland: { id: "SUI", name: "Suíça", englishName: "Switzerland", iso2: "CH" },
  Brazil: { id: "BRA", name: "Brasil", englishName: "Brazil", iso2: "BR" },
  Morocco: { id: "MAR", name: "Marrocos", englishName: "Morocco", iso2: "MA" },
  Haiti: { id: "HAI", name: "Haiti", englishName: "Haiti", iso2: "HT" },
  Scotland: { id: "SCO", name: "Escócia", englishName: "Scotland", iso2: "GB-SCT" },
  USA: { id: "USA", name: "Estados Unidos", englishName: "USA", iso2: "US" },
  "United States": { id: "USA", name: "Estados Unidos", englishName: "United States", iso2: "US" },
  Paraguay: { id: "PAR", name: "Paraguai", englishName: "Paraguay", iso2: "PY" },
  Australia: { id: "AUS", name: "Austrália", englishName: "Australia", iso2: "AU" },
  Turkey: { id: "TUR", name: "Turquia", englishName: "Turkey", iso2: "TR" },
  Germany: { id: "GER", name: "Alemanha", englishName: "Germany", iso2: "DE" },
  "Curaçao": { id: "CUW", name: "Curaçao", englishName: "Curaçao", iso2: "CW" },
  "Ivory Coast": { id: "CIV", name: "Costa do Marfim", englishName: "Ivory Coast", iso2: "CI" },
  Ecuador: { id: "ECU", name: "Equador", englishName: "Ecuador", iso2: "EC" },
  Netherlands: { id: "NED", name: "Países Baixos", englishName: "Netherlands", iso2: "NL" },
  Japan: { id: "JPN", name: "Japão", englishName: "Japan", iso2: "JP" },
  Sweden: { id: "SWE", name: "Suécia", englishName: "Sweden", iso2: "SE" },
  Tunisia: { id: "TUN", name: "Tunísia", englishName: "Tunisia", iso2: "TN" },
  Belgium: { id: "BEL", name: "Bélgica", englishName: "Belgium", iso2: "BE" },
  Egypt: { id: "EGY", name: "Egito", englishName: "Egypt", iso2: "EG" },
  Iran: { id: "IRN", name: "Irã", englishName: "Iran", iso2: "IR" },
  "New Zealand": { id: "NZL", name: "Nova Zelândia", englishName: "New Zealand", iso2: "NZ" },
  Spain: { id: "ESP", name: "Espanha", englishName: "Spain", iso2: "ES" },
  "Cape Verde": { id: "CPV", name: "Cabo Verde", englishName: "Cape Verde", iso2: "CV" },
  "Saudi Arabia": { id: "KSA", name: "Arábia Saudita", englishName: "Saudi Arabia", iso2: "SA" },
  Uruguay: { id: "URU", name: "Uruguai", englishName: "Uruguay", iso2: "UY" },
  France: { id: "FRA", name: "França", englishName: "France", iso2: "FR" },
  Senegal: { id: "SEN", name: "Senegal", englishName: "Senegal", iso2: "SN" },
  Iraq: { id: "IRQ", name: "Iraque", englishName: "Iraq", iso2: "IQ" },
  Norway: { id: "NOR", name: "Noruega", englishName: "Norway", iso2: "NO" },
  Argentina: { id: "ARG", name: "Argentina", englishName: "Argentina", iso2: "AR" },
  Algeria: { id: "ALG", name: "Argélia", englishName: "Algeria", iso2: "DZ" },
  Austria: { id: "AUT", name: "Áustria", englishName: "Austria", iso2: "AT" },
  Jordan: { id: "JOR", name: "Jordânia", englishName: "Jordan", iso2: "JO" },
  Portugal: { id: "POR", name: "Portugal", englishName: "Portugal", iso2: "PT" },
  "DR Congo": { id: "COD", name: "RD Congo", englishName: "DR Congo", iso2: "CD" },
  Uzbekistan: { id: "UZB", name: "Uzbequistão", englishName: "Uzbekistan", iso2: "UZ" },
  Colombia: { id: "COL", name: "Colômbia", englishName: "Colombia", iso2: "CO" },
  England: { id: "ENG", name: "Inglaterra", englishName: "England", iso2: "GB-ENG" },
  Croatia: { id: "CRO", name: "Croácia", englishName: "Croatia", iso2: "HR" },
  Ghana: { id: "GHA", name: "Gana", englishName: "Ghana", iso2: "GH" },
  Panama: { id: "PAN", name: "Panamá", englishName: "Panama", iso2: "PA" }
};

export const WORLD_CUP_TEAMS = Object.values(TEAM_BY_ENGLISH_NAME).filter(
  (team, index, list) => list.findIndex((candidate) => candidate.id === team.id) === index
);

export const WORLD_CUP_TEAM_BY_ID = new Map(
  WORLD_CUP_TEAMS.map((team) => [team.id, team])
);

function parseKickoff(date: string, time: string): Date {
  const match = /^(\d{2}):(\d{2}) UTC([+-]\d{1,2})$/.exec(time.trim());
  if (!match) throw new Error(`Horário inválido no calendário: ${date} ${time}`);
  const [, hour, minute, rawOffset] = match;
  const numericOffset = Number(rawOffset);
  const sign = numericOffset >= 0 ? "+" : "-";
  const offset = `${sign}${String(Math.abs(numericOffset)).padStart(2, "0")}:00`;
  const value = new Date(`${date}T${hour}:${minute}:00${offset}`);
  if (Number.isNaN(value.getTime())) throw new Error(`Data inválida no calendário: ${date} ${time}`);
  return value;
}

function phaseFromRound(round: string): WorldCupPhase {
  if (round.startsWith("Matchday")) return "GROUP_STAGE";
  if (round === "Round of 32") return "ROUND_OF_32";
  if (round === "Round of 16") return "ROUND_OF_16";
  if (round === "Quarter-final") return "QUARTER_FINAL";
  if (round === "Semi-final") return "SEMI_FINAL";
  if (round === "Match for third place") return "THIRD_PLACE";
  if (round === "Final") return "FINAL";
  throw new Error(`Fase desconhecida: ${round}`);
}

function placeholderLabel(value: string): string {
  const winner = /^W(\d+)$/.exec(value);
  if (winner) return `Vencedor do jogo ${winner[1]}`;
  const loser = /^L(\d+)$/.exec(value);
  if (loser) return `Perdedor do jogo ${loser[1]}`;
  const placed = /^([123])(.*)$/.exec(value);
  if (placed) {
    const position = placed[1] === "1" ? "1º" : placed[1] === "2" ? "2º" : "3º";
    const groups = placed[2].split("/").filter(Boolean).join(", ");
    return groups.length === 1
      ? `${position} do Grupo ${groups}`
      : `${position} colocado dos grupos ${groups}`;
  }
  return value;
}

function resolveTeam(value: string) {
  const team = TEAM_BY_ENGLISH_NAME[value];
  if (team) return { id: team.id, name: team.name, iso2: team.iso2, resolved: true };
  return { id: value, name: placeholderLabel(value), iso2: undefined, resolved: false };
}

function assignGroupMetadata(matches: ProvisionalMatch[]) {
  const groupMatches = matches
    .filter((match) => match.phase === "GROUP_STAGE")
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.sourceIndex - b.sourceIndex);

  if (groupMatches.length !== 72) {
    throw new Error(`A fonte retornou ${groupMatches.length} jogos de grupos; eram esperados 72.`);
  }

  const matchNumberByIndex = new Map<number, number>();
  groupMatches.forEach((match, index) => matchNumberByIndex.set(match.sourceIndex, index + 1));

  const groupRoundByIndex = new Map<number, 1 | 2 | 3>();
  const groups = new Map<string, ProvisionalMatch[]>();
  for (const match of groupMatches) {
    if (!match.group) throw new Error("Jogo da fase de grupos sem grupo definido.");
    const list = groups.get(match.group) ?? [];
    list.push(match);
    groups.set(match.group, list);
  }

  for (const [group, list] of groups) {
    list.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.sourceIndex - b.sourceIndex);
    if (list.length !== 6) throw new Error(`O Grupo ${group} possui ${list.length} partidas; eram esperadas 6.`);
    list.forEach((match, index) => groupRoundByIndex.set(match.sourceIndex, (Math.floor(index / 2) + 1) as 1 | 2 | 3));
  }

  return { matchNumberByIndex, groupRoundByIndex };
}

export async function fetchWorldCupSchedule(): Promise<WorldCupScheduleMatch[]> {
  const response = await fetch(OPEN_FOOTBALL_SCHEDULE_URL, {
    headers: { Accept: "application/json", "User-Agent": "super-bolao-2026/1.0" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Falha ao consultar calendário (${response.status})`);
  const payload = (await response.json()) as OpenFootballPayload;
  if (!Array.isArray(payload.matches) || payload.matches.length !== 104) {
    throw new Error(`A fonte retornou ${payload.matches?.length ?? 0} partidas; eram esperadas 104.`);
  }

  const provisional: ProvisionalMatch[] = payload.matches.map((match, sourceIndex) => {
    const phase = phaseFromRound(match.round);
    const home = resolveTeam(match.team1);
    const away = resolveTeam(match.team2);
    return {
      sourceIndex,
      sourceNumber: match.num,
      phase,
      group: match.group?.replace("Group ", ""),
      homeTeamId: home.id,
      homeTeamName: home.name,
      homeTeamIso2: home.iso2,
      awayTeamId: away.id,
      awayTeamName: away.name,
      awayTeamIso2: away.iso2,
      teamsResolved: home.resolved && away.resolved,
      kickoffAt: parseKickoff(match.date, match.time),
      venue: match.ground ?? "A definir",
      sourceUrl: FIFA_FIXTURES_URL
    };
  });

  const { matchNumberByIndex, groupRoundByIndex } = assignGroupMetadata(provisional);

  return provisional
    .map((match): WorldCupScheduleMatch => {
      let matchNumber = match.sourceNumber;
      if (match.phase === "GROUP_STAGE") matchNumber = matchNumberByIndex.get(match.sourceIndex);
      if (match.phase === "THIRD_PLACE") matchNumber = 103;
      if (match.phase === "FINAL") matchNumber = 104;
      if (!matchNumber) throw new Error(`Número não encontrado para a partida da fase ${match.phase}.`);

      return {
        matchNumber,
        phase: match.phase,
        group: match.group,
        groupRound: groupRoundByIndex.get(match.sourceIndex),
        homeTeamId: match.homeTeamId,
        homeTeamName: match.homeTeamName,
        homeTeamIso2: match.homeTeamIso2,
        awayTeamId: match.awayTeamId,
        awayTeamName: match.awayTeamName,
        awayTeamIso2: match.awayTeamIso2,
        teamsResolved: match.teamsResolved,
        kickoffAt: match.kickoffAt,
        venue: match.venue,
        sourceUrl: match.sourceUrl
      };
    })
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

export async function syncWorldCupSchedule(store: Firestore) {
  const schedule = await fetchWorldCupSchedule();
  const existing = await store.collection("matches").get();
  const existingById = new Map(existing.docs.map((doc) => [doc.id, doc.data()]));
  const batch = store.batch();

  for (const match of schedule) {
    const id = `fifa-2026-${String(match.matchNumber).padStart(3, "0")}`;
    const prior = existingById.get(id);
    batch.set(
      store.collection("matches").doc(id),
      {
        matchNumber: match.matchNumber,
        phase: match.phase,
        group: match.group ?? null,
        groupRound: match.groupRound ?? null,
        homeTeamId: match.homeTeamId,
        homeTeamName: match.homeTeamName,
        homeTeamIso2: match.homeTeamIso2 ?? null,
        awayTeamId: match.awayTeamId,
        awayTeamName: match.awayTeamName,
        awayTeamIso2: match.awayTeamIso2 ?? null,
        teamsResolved: match.teamsResolved,
        venue: match.venue,
        kickoffAt: Timestamp.fromDate(match.kickoffAt),
        status: prior?.status ?? "SCHEDULED",
        scoringStatus: prior?.scoringStatus ?? "PENDING",
        competitionRoundId: carismaRoundIdForMatch(match.phase, match.groupRound),
        livePeriod: prior?.livePeriod ?? null,
        liveMinute: prior?.liveMinute ?? null,
        liveHomeScore: prior?.liveHomeScore ?? null,
        liveAwayScore: prior?.liveAwayScore ?? null,
        resultSource: prior?.resultSource ?? null,
        sourceProvider: "OpenFootball + FIFA",
        sourceUrl: match.sourceUrl,
        sourceUpdatedAt: FieldValue.serverTimestamp(),
        createdAt: prior?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  const groupByTeam = new Map<string, string>();
  for (const match of schedule.filter((item) => item.phase === "GROUP_STAGE" && item.group)) {
    groupByTeam.set(match.homeTeamId, match.group!);
    groupByTeam.set(match.awayTeamId, match.group!);
  }
  for (const team of WORLD_CUP_TEAMS) {
    batch.set(
      store.collection("teams").doc(team.id),
      {
        teamId: team.id,
        name: team.name,
        englishName: team.englishName,
        iso2: team.iso2,
        group: groupByTeam.get(team.id) ?? null,
        active: true,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  batch.set(
    store.collection("systemConfig").doc("worldCupData"),
    {
      scheduleCount: schedule.length,
      sourceProvider: "OpenFootball (CC0), conferido com calendário FIFA",
      sourceUrl: OPEN_FOOTBALL_SCHEDULE_URL,
      fifaUrl: FIFA_FIXTURES_URL,
      lastScheduleSyncAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();
  return { matches: schedule.length, teams: WORLD_CUP_TEAMS.length };
}
