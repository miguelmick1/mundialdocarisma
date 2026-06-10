import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { fetchWorldCupFixtureWindow, fetchWorldCupFixtures } from "@/lib/api-football/client";
import type { ApiFootballFixture, ApiFootballQuota } from "@/lib/api-football/types";
import { linkFixturesToLocalMatches, normalizeTeamName, type LocalMatchForLink } from "@/lib/api-football/mapping";
import { WORLD_CUP_TEAMS } from "@/lib/world-cup/schedule";
import {
  FINISHED_SHORT_STATUSES,
  LIVE_SHORT_STATUSES,
  REVIEW_SHORT_STATUSES,
  localStatusForApi,
} from "@/lib/live-score/status";

const RUNTIME_REF = adminDb.collection("systemRuntime").doc("liveScore");

const TEAM_BY_NORMALIZED_NAME = new Map(
  WORLD_CUP_TEAMS.flatMap((team) => [
    [normalizeTeamName(team.name), team] as const,
    [normalizeTeamName(team.englishName), team] as const,
  ]),
);

function fixtureIdentityUpdate(fixture: ApiFootballFixture): Record<string, unknown> {
  const home = TEAM_BY_NORMALIZED_NAME.get(normalizeTeamName(fixture.teams.home.name));
  const away = TEAM_BY_NORMALIZED_NAME.get(normalizeTeamName(fixture.teams.away.name));
  const update: Record<string, unknown> = {
    apiFootballFixtureId: fixture.fixture.id,
    apiFootballHomeTeamId: fixture.teams.home.id,
    apiFootballAwayTeamId: fixture.teams.away.id,
    apiFootballRound: fixture.league.round,
    apiFootballStatus: fixture.fixture.status.short,
    apiFootballStatusLong: fixture.fixture.status.long,
    apiFootballKickoffAt: Timestamp.fromDate(new Date(fixture.fixture.date)),
  };
  if (home && away) {
    update.homeTeamId = home.id;
    update.homeTeamName = home.name;
    update.homeTeamIso2 = home.iso2;
    update.awayTeamId = away.id;
    update.awayTeamName = away.name;
    update.awayTeamIso2 = away.iso2;
    update.teamsResolved = true;
  }
  if (fixture.fixture.venue?.name) {
    update.venue = fixture.fixture.venue.city
      ? `${fixture.fixture.venue.name}, ${fixture.fixture.venue.city}`
      : fixture.fixture.venue.name;
  }
  return update;
}
export type LiveSyncTrigger = "SCHEDULER" | "VIEWER" | "ADMIN" | "SCRIPT";

export interface LiveSyncOptions {
  trigger: LiveSyncTrigger;
  force?: boolean;
  freshnessMs?: number;
  fullSchedule?: boolean;
}

export interface LiveSyncResult {
  status: "UPDATED" | "FRESH" | "LOCKED";
  fetchedFixtures: number;
  linkedMatches: number;
  updatedMatches: number;
  reviewMatches: number;
  lastSuccessfulAt: string | null;
  quota: ApiFootballQuota | null;
}

type LocalMatchSnapshot = LocalMatchForLink & {
  refPath: string;
  status: string;
  scoringStatus?: string | null;
  liveSyncPaused?: boolean;
  livePeriod?: string | null;
  liveUpdatedAt?: Date | null;
};

function timestampDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function apiPeriod(short: string, current?: string | null): "1H" | "HT" | "2H" | "ET" | "PEN" | null {
  if (short === "1H") return "1H";
  if (short === "HT") return "HT";
  if (short === "2H" || short === "INT") return "2H";
  if (short === "ET" || short === "BT") return "ET";
  if (short === "P") return "PEN";
  if (short === "LIVE") {
    return current === "1H" || current === "HT" || current === "2H" || current === "ET" || current === "PEN"
      ? current
      : "1H";
  }
  return null;
}


function finalScores(fixture: ApiFootballFixture) {
  const fulltime = fixture.score?.fulltime ?? { home: null, away: null };
  const extratime = fixture.score?.extratime ?? { home: null, away: null };
  const penalty = fixture.score?.penalty ?? { home: null, away: null };
  const current = fixture.goals ?? { home: null, away: null };
  return {
    home90: fulltime.home,
    away90: fulltime.away,
    home120: extratime.home,
    away120: extratime.away,
    homePenalties: penalty.home,
    awayPenalties: penalty.away,
    currentHome: current.home,
    currentAway: current.away,
  };
}

function matchUpdate(local: LocalMatchSnapshot, fixture: ApiFootballFixture): Record<string, unknown> {
  const short = fixture.fixture.status.short;
  const mappedStatus = localStatusForApi(short);
  const scores = finalScores(fixture);
  const update: Record<string, unknown> = {
    ...fixtureIdentityUpdate(fixture),
    apiFootballLastFetchedAt: FieldValue.serverTimestamp(),
    apiFootballNeedsReview: REVIEW_SHORT_STATUSES.has(short),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (local.status === "FINISHED" || local.status === "VOID" || local.scoringStatus === "CALCULATED" || local.scoringStatus === "VOID") {
    return update;
  }
  if (local.liveSyncPaused) return update;

  if (mappedStatus) update.status = mappedStatus;
  if (mappedStatus === "LIVE" || mappedStatus === "HALFTIME" || mappedStatus === "EXTRA_TIME") {
    update.livePeriod = apiPeriod(short, local.livePeriod);
    update.liveMinute = fixture.fixture.status.elapsed ?? null;
    update.liveHomeScore = scores.currentHome;
    update.liveAwayScore = scores.currentAway;
    update.liveUpdatedAt = FieldValue.serverTimestamp();
    update.resultSource = "API_FOOTBALL";
  }

  if (mappedStatus === "FINISHED_PROVISIONAL") {
    const finalHome = scores.home120 ?? scores.home90 ?? scores.currentHome;
    const finalAway = scores.away120 ?? scores.away90 ?? scores.currentAway;
    update.scoringStatus = "PENDING";
    update.homeScore90 = scores.home90;
    update.awayScore90 = scores.away90;
    update.homeScore120 = scores.home120;
    update.awayScore120 = scores.away120;
    update.homePenalties = scores.homePenalties;
    update.awayPenalties = scores.awayPenalties;
    update.liveHomeScore = finalHome;
    update.liveAwayScore = finalAway;
    update.livePeriod = null;
    update.liveMinute = null;
    update.liveUpdatedAt = FieldValue.serverTimestamp();
    update.resultSource = "API_FOOTBALL";
  }

  return update;
}

async function claimLock(options: LiveSyncOptions): Promise<LiveSyncResult | null> {
  const now = new Date();
  const freshnessMs = options.freshnessMs ?? 20_000;
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(RUNTIME_REF);
    const data = snap.data() ?? {};
    const lastFetchedAt = timestampDate(data.lastFetchedAt);
    const lastCheckedAt = timestampDate(data.lastCheckedAt) ?? lastFetchedAt;
    const lockedUntil = timestampDate(data.lockedUntil);
    if (!options.force && lastCheckedAt && now.getTime() - lastCheckedAt.getTime() < freshnessMs) {
      return {
        status: "FRESH" as const,
        fetchedFixtures: 0,
        linkedMatches: 0,
        updatedMatches: 0,
        reviewMatches: 0,
        lastSuccessfulAt: timestampDate(data.lastSuccessfulAt)?.toISOString() ?? null,
        quota: null,
      };
    }
    if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
      return {
        status: "LOCKED" as const,
        fetchedFixtures: 0,
        linkedMatches: 0,
        updatedMatches: 0,
        reviewMatches: 0,
        lastSuccessfulAt: timestampDate(data.lastSuccessfulAt)?.toISOString() ?? null,
        quota: null,
      };
    }
    tx.set(RUNTIME_REF, {
      lockedUntil: Timestamp.fromDate(new Date(now.getTime() + 55_000)),
      lastAttemptAt: Timestamp.fromDate(now),
      lastCheckedAt: Timestamp.fromDate(now),
      lastTrigger: options.trigger,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return null;
  });
}

async function localMatches(fullSchedule = true, now = new Date()): Promise<LocalMatchSnapshot[]> {
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (fullSchedule) {
    const snap = await adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get();
    docs = snap.docs;
  } else {
    const from = Timestamp.fromDate(new Date(now.getTime() - 6 * 60 * 60 * 1000));
    const to = Timestamp.fromDate(new Date(now.getTime() + 20 * 60 * 1000));
    const [windowSnap, activeSnap] = await Promise.all([
      adminDb.collection("matches")
        .where("kickoffAt", ">=", from)
        .where("kickoffAt", "<=", to)
        .get(),
      adminDb.collection("matches")
        .where("status", "in", ["LIVE", "HALFTIME", "EXTRA_TIME"])
        .get(),
    ]);
    const unique = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...windowSnap.docs, ...activeSnap.docs].forEach((doc) => unique.set(doc.id, doc));
    docs = [...unique.values()];
  }

  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      refPath: doc.ref.path,
      matchNumber: Number(data.matchNumber ?? 0),
      phase: typeof data.phase === "string" ? data.phase : null,
      kickoffAt: timestampDate(data.kickoffAt) ?? new Date(0),
      homeTeamName: typeof data.homeTeamName === "string" ? data.homeTeamName : null,
      awayTeamName: typeof data.awayTeamName === "string" ? data.awayTeamName : null,
      homeTeamId: typeof data.homeTeamId === "string" ? data.homeTeamId : null,
      awayTeamId: typeof data.awayTeamId === "string" ? data.awayTeamId : null,
      teamsResolved: data.teamsResolved !== false,
      apiFootballFixtureId: typeof data.apiFootballFixtureId === "number" ? data.apiFootballFixtureId : null,
      status: typeof data.status === "string" ? data.status : "SCHEDULED",
      scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : null,
      liveSyncPaused: data.liveSyncPaused === true,
      livePeriod: typeof data.livePeriod === "string" ? data.livePeriod : null,
      liveUpdatedAt: timestampDate(data.liveUpdatedAt),
    };
  });
}

export async function linkAllWorldCupFixtures() {
  const [{ data, quota }, locals] = await Promise.all([fetchWorldCupFixtures(), localMatches(true)]);
  const links = linkFixturesToLocalMatches(locals, data.response);
  const batch = adminDb.batch();
  let linked = 0;
  for (const local of locals) {
    const fixture = links.get(local.id);
    if (!fixture) continue;
    batch.set(adminDb.doc(local.refPath), {
      ...fixtureIdentityUpdate(fixture),
      apiFootballLinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    linked += 1;
  }
  batch.set(adminDb.collection("systemConfig").doc("apiFootball"), {
    leagueId: 1,
    season: 2026,
    availableFixtures: data.response.length,
    linkedMatches: linked,
    lastLinkAt: FieldValue.serverTimestamp(),
    dailyRemaining: quota.dailyRemaining,
    minuteRemaining: quota.minuteRemaining,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { availableFixtures: data.response.length, linkedMatches: linked, quota };
}

export async function syncLiveScores(options: LiveSyncOptions): Promise<LiveSyncResult> {
  const early = await claimLock(options);
  if (early) return early;

  try {
    const locals = await localMatches(options.fullSchedule === true, new Date());
    const now = Date.now();
    const monitoringRequired = locals.some((match) => {
      if (["LIVE", "HALFTIME", "EXTRA_TIME"].includes(match.status)) return true;
      if (match.status === "FINISHED_PROVISIONAL") {
        return !match.liveUpdatedAt || now - match.liveUpdatedAt.getTime() < 3 * 60 * 60 * 1000;
      }
      const kickoff = match.kickoffAt.getTime();
      return kickoff >= now - 5 * 60 * 60 * 1000 && kickoff <= now + 20 * 60 * 1000;
    });

    if (!options.fullSchedule && !monitoringRequired) {
      await RUNTIME_REF.set({
        lockedUntil: Timestamp.fromMillis(0),
        lastSkippedAt: FieldValue.serverTimestamp(),
        lastCheckedAt: FieldValue.serverTimestamp(),
        lastTrigger: options.trigger,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        status: "FRESH",
        fetchedFixtures: 0,
        linkedMatches: 0,
        updatedMatches: 0,
        reviewMatches: 0,
        lastSuccessfulAt: null,
        quota: null,
      };
    }

    const { data, quota } = options.fullSchedule
      ? await fetchWorldCupFixtures()
      : await fetchWorldCupFixtureWindow();
    const links = linkFixturesToLocalMatches(locals, data.response);
    const batch = adminDb.batch();
    let updatedMatches = 0;
    let reviewMatches = 0;

    for (const local of locals) {
      const fixture = links.get(local.id);
      if (!fixture) continue;
      const update = matchUpdate(local, fixture);
      batch.set(adminDb.doc(local.refPath), update, { merge: true });
      updatedMatches += 1;
      if (REVIEW_SHORT_STATUSES.has(fixture.fixture.status.short)) reviewMatches += 1;
    }

    batch.set(RUNTIME_REF, {
      lockedUntil: Timestamp.fromMillis(0),
      lastFetchedAt: FieldValue.serverTimestamp(),
      lastCheckedAt: FieldValue.serverTimestamp(),
      lastSuccessfulAt: FieldValue.serverTimestamp(),
      lastError: null,
      lastTrigger: options.trigger,
      fetchedFixtures: data.response.length,
      linkedMatches: links.size,
      updatedMatches,
      reviewMatches,
      dailyRemaining: quota.dailyRemaining,
      minuteRemaining: quota.minuteRemaining,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    return {
      status: "UPDATED",
      fetchedFixtures: data.response.length,
      linkedMatches: links.size,
      updatedMatches,
      reviewMatches,
      lastSuccessfulAt: new Date().toISOString(),
      quota,
    };
  } catch (error) {
    await RUNTIME_REF.set({
      lockedUntil: Timestamp.fromMillis(0),
      lastError: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN_ERROR",
      lastFailedAt: FieldValue.serverTimestamp(),
      lastTrigger: options.trigger,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}

export async function getLiveSyncState() {
  const snap = await RUNTIME_REF.get();
  const data = snap.data() ?? {};
  return {
    lastAttemptAt: timestampDate(data.lastAttemptAt)?.toISOString() ?? null,
    lastFetchedAt: timestampDate(data.lastFetchedAt)?.toISOString() ?? null,
    lastCheckedAt: timestampDate(data.lastCheckedAt)?.toISOString() ?? null,
    lastSuccessfulAt: timestampDate(data.lastSuccessfulAt)?.toISOString() ?? null,
    lastFailedAt: timestampDate(data.lastFailedAt)?.toISOString() ?? null,
    lastError: typeof data.lastError === "string" ? data.lastError : null,
    lastTrigger: typeof data.lastTrigger === "string" ? data.lastTrigger : null,
    fetchedFixtures: Number(data.fetchedFixtures ?? 0),
    linkedMatches: Number(data.linkedMatches ?? 0),
    updatedMatches: Number(data.updatedMatches ?? 0),
    reviewMatches: Number(data.reviewMatches ?? 0),
    dailyRemaining: typeof data.dailyRemaining === "number" ? data.dailyRemaining : null,
    minuteRemaining: typeof data.minuteRemaining === "number" ? data.minuteRemaining : null,
  };
}

export const apiFootballStatusSets = {
  live: LIVE_SHORT_STATUSES,
  finished: FINISHED_SHORT_STATUSES,
  review: REVIEW_SHORT_STATUSES,
};
