import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { botDisplayName } from "@/lib/bots/identities";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";
import {
  calculateGroupStandings,
  compareStandingRows,
  seedParticipants,
  selectByeParticipants,
  type GroupAssignment,
  type GroupFixture,
  type ParticipantRoundScore,
} from "@/lib/competition/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    await processAutomaticBotGuessesSafely();
    const [assignmentSnap, fixtureSnap, matchesSnap, eventsSnap, configSnap, carismaSnap, teamsSnap] = await Promise.all([
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("participantGroupFixtures").get(),
      adminDb.collection("matches").where("phase", "==", "GROUP_STAGE").get(),
      adminDb.collection("scoreEvents").where("active", "==", true).get(),
      adminDb.collection("competitionConfig").doc("main").get(),
      adminDb.collection("carismaSelections").get(),
      adminDb.collection("teams").get(),
    ]);

    const assignments = assignmentSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        displayName: data.type === "BOT"
          ? botDisplayName({ id: doc.id, fallback: typeof data.displayName === "string" ? data.displayName : doc.id })
          : data.displayName,
      };
    }) as GroupAssignment[];
    const fixtures = fixtureSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as GroupFixture[];
    const carismaIndex = buildCarismaSelectionIndex(carismaSnap.docs.map((doc) => doc.data()));
    const teamsById = new Map(teamsSnap.docs.map((doc) => [doc.id, doc.data()]));

    function enrichParticipant<T extends GroupAssignment | ReturnType<typeof calculateGroupStandings>[number]>(row: T) {
      if (row.type !== "HUMAN") return row;
      const selection = carismaIndex.canonicalGroupByParticipant.get(row.id);
      if (!selection) return row;
      const team = teamsById.get(selection.teamId);
      return {
        ...row,
        carismaTeam: {
          id: selection.teamId,
          name: selection.teamName || (typeof team?.name === "string" ? team.name : selection.teamId),
          iso2: selection.teamIso2 || (typeof team?.iso2 === "string" ? team.iso2 : null),
        },
      };
    }

    const enrichedAssignments = assignments.map(enrichParticipant);
    const matchRound = new Map<string, 1 | 2 | 3>();
    const roundStatuses = new Map<number, string[]>();
    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      const round = Number(data.groupRound) as 1 | 2 | 3;
      if (![1, 2, 3].includes(round)) continue;
      matchRound.set(doc.id, round);
      const statuses = roundStatuses.get(round) ?? [];
      statuses.push(String(data.status ?? "SCHEDULED"));
      roundStatuses.set(round, statuses);
    }

    const scoreMap = new Map<string, ParticipantRoundScore>();
    const bestByMatchParticipant = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const round = matchRound.get(String(data.matchId ?? ""));
      if (!round) continue;
      const participantId = String(data.participantId ?? "");
      const matchId = String(data.matchId ?? "");
      const key = `${matchId}:${participantId}`;
      const current = bestByMatchParticipant.get(key);
      if (!current || Number(data.totalPoints ?? 0) > Number(current.totalPoints ?? 0)) {
        bestByMatchParticipant.set(key, data);
      }
    }
    for (const data of bestByMatchParticipant.values()) {
      const round = matchRound.get(String(data.matchId));
      if (!round) continue;
      const participantId = String(data.participantId);
      const key = `${participantId}:${round}`;
      const row = scoreMap.get(key) ?? { participantId, round, points: 0, exactHits: 0 };
      row.points += Number(data.totalPoints ?? 0);
      if (data.baseCode === "BASE_EXACT_SCORE") row.exactHits += 1;
      scoreMap.set(key, row);
    }

    const completedRounds = new Set<number>();
    for (const [round, statuses] of roundStatuses) {
      if (statuses.length > 0 && statuses.every((status) => ["FINISHED", "VOID"].includes(status))) completedRounds.add(round);
    }

    const standings = calculateGroupStandings(assignments, fixtures, [...scoreMap.values()], completedRounds);
    const groups = ["A", "B", "C", "D"].map((groupId) => {
      const rows = standings
        .filter((row) => row.groupId === groupId)
        .sort(compareStandingRows)
        .map(enrichParticipant);
      const groupFixtures = fixtures
        .filter((fixture) => fixture.groupId === groupId)
        .map((fixture) => ({
          ...fixture,
          home: enrichedAssignments.find((item) => item.id === fixture.homeParticipantId) ?? null,
          away: enrichedAssignments.find((item) => item.id === fixture.awayParticipantId) ?? null,
          homeRoundPoints: scoreMap.get(`${fixture.homeParticipantId}:${fixture.round}`)?.points ?? 0,
          awayRoundPoints: scoreMap.get(`${fixture.awayParticipantId}:${fixture.round}`)?.points ?? 0,
          completed: completedRounds.has(fixture.round),
        }));
      return { id: groupId, name: `Grupo ${groupId}`, rows, fixtures: groupFixtures };
    });

    const groupStageComplete = completedRounds.size === 3;
    const seeded = groupStageComplete ? seedParticipants(standings).map(enrichParticipant) : [];
    const byes = groupStageComplete ? selectByeParticipants(standings).map(enrichParticipant) : [];
    const byeIds = new Set(byes.map((row) => row.id));
    const playIn = groupStageComplete ? seeded.filter((row) => !byeIds.has(row.id)) : [];
    const config = configSnap.data() ?? {};

    return NextResponse.json({
      competitionName: config.name ?? "Mundial Snickers do Carisma",
      currentUserId: user.uid,
      groupDrawCompleted: Boolean(config.groupDrawCompleted),
      carismaDrawCompleted: Boolean(config.carismaDrawCompleted),
      completedRounds: [...completedRounds],
      groupStageComplete,
      groups,
      knockout: {
        byes,
        playIn,
        note: "Os dois melhores líderes descansam nos 16-avos. A composição definitiva das chaves Pedreiros e Pangas será consolidada após o debate do regulamento.",
      },
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("competition-overview", error);
    return NextResponse.json({ error: "Não foi possível carregar a classificação." }, { status: 500 });
  }
}
