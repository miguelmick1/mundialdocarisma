import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
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
    const [assignmentSnap, fixtureSnap, matchesSnap, eventsSnap, configSnap] = await Promise.all([
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("participantGroupFixtures").get(),
      adminDb.collection("matches").where("phase", "==", "GROUP_STAGE").get(),
      adminDb.collection("scoreEvents").where("active", "==", true).get(),
      adminDb.collection("competitionConfig").doc("main").get(),
    ]);

    const assignments = assignmentSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as GroupAssignment[];
    const fixtures = fixtureSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as GroupFixture[];

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
    const bestByMatchParticipant = new Map<string, any>();
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
      const rows = standings.filter((row) => row.groupId === groupId).sort(compareStandingRows);
      const groupFixtures = fixtures
        .filter((fixture) => fixture.groupId === groupId)
        .map((fixture) => ({
          ...fixture,
          home: assignments.find((item) => item.id === fixture.homeParticipantId) ?? null,
          away: assignments.find((item) => item.id === fixture.awayParticipantId) ?? null,
          homeRoundPoints: scoreMap.get(`${fixture.homeParticipantId}:${fixture.round}`)?.points ?? 0,
          awayRoundPoints: scoreMap.get(`${fixture.awayParticipantId}:${fixture.round}`)?.points ?? 0,
          completed: completedRounds.has(fixture.round),
        }));
      return { id: groupId, name: `Grupo ${groupId}`, rows, fixtures: groupFixtures };
    });

    const groupStageComplete = completedRounds.size === 3;
    const seeded = groupStageComplete ? seedParticipants(standings) : [];
    const byes = groupStageComplete ? selectByeParticipants(standings) : [];
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
