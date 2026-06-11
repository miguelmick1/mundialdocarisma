import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import {
  CARISMA_ROUNDS,
  CARISMA_ROUND_LABELS,
  GROUP_ROUNDS,
  isCarismaRound,
  isGroupRound,
  matchBelongsToCarismaRound,
  type CarismaRoundId,
} from "@/lib/world-cup/rounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  roundId: z.string().refine(isCarismaRound, "Rodada inválida"),
  teamId: z.string().min(1),
});

type TeamCandidate = {
  id: string;
  name: string;
  iso2: string | null;
  group: string | null;
  firstKickoff: number;
};

type AllocationTeam = { id: string; name?: string; iso2?: string | null; pot?: number };

function firstGroupKickoffByTeam(matchDocs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const result = new Map<string, number>();
  for (const doc of matchDocs) {
    const match = doc.data();
    if (match.phase !== "GROUP_STAGE" || match.teamsResolved === false) continue;
    const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
    if (!kickoff) continue;
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId) continue;
      const current = result.get(teamId);
      if (current == null || kickoff.getTime() < current) result.set(teamId, kickoff.getTime());
    }
  }
  return result;
}

function buildRoundPayload(
  roundId: CarismaRoundId,
  matchDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  selection: FirebaseFirestore.DocumentData | undefined,
  teamsById: Map<string, FirebaseFirestore.DocumentData>,
  allocationIds: Set<string>,
  allocationTeams: AllocationTeam[],
  groupKickoffByTeam: Map<string, number>,
  now: number,
) {
  const candidates = new Map<string, TeamCandidate>();

  for (const doc of matchDocs) {
    const match = doc.data();
    if (!matchBelongsToCarismaRound(match, roundId) || match.teamsResolved === false) continue;
    const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
    if (!kickoff) continue;
    for (const entry of [
      { id: match.homeTeamId, name: match.homeTeamName, iso2: match.homeTeamIso2 },
      { id: match.awayTeamId, name: match.awayTeamName, iso2: match.awayTeamIso2 },
    ]) {
      if (!entry.id) continue;
      const existing = candidates.get(entry.id);
      const timestamp = kickoff.getTime();
      if (!existing || timestamp < existing.firstKickoff) {
        const teamDoc = teamsById.get(entry.id);
        candidates.set(entry.id, {
          id: entry.id,
          name: typeof teamDoc?.name === "string" ? teamDoc.name : (entry.name ?? entry.id),
          iso2: typeof teamDoc?.iso2 === "string" ? teamDoc.iso2 : (entry.iso2 ?? null),
          group: typeof match.group === "string" ? match.group : null,
          firstKickoff: timestamp,
        });
      }
    }
  }

  const restrictedToDraw = isGroupRound(roundId);
  const teams = [...candidates.values()]
    .filter((team) => !restrictedToDraw || allocationIds.has(team.id))
    .sort((a, b) => a.firstKickoff - b.firstKickoff || a.name.localeCompare(b.name, "pt-BR"))
    .map((team) => {
      const teamDoc = teamsById.get(team.id);
      const eliminated = teamDoc?.active === false || Boolean(teamDoc?.eliminatedAt);
      const effectiveFirstKickoff = restrictedToDraw
        ? (groupKickoffByTeam.get(team.id) ?? team.firstKickoff)
        : team.firstKickoff;
      const alreadyPlayed = effectiveFirstKickoff <= now;
      return {
        id: team.id,
        name: team.name,
        iso2: team.iso2,
        group: team.group,
        firstKickoff: new Date(team.firstKickoff).toISOString(),
        eligible: !eliminated && !alreadyPlayed,
        unavailableReason: eliminated ? "Seleção eliminada" : alreadyPlayed ? "Primeiro jogo já iniciado" : null,
      };
    });

  const eligibleTeams = teams.filter((team) => team.eligible);
  const selectedTeamId = typeof selection?.teamId === "string" ? selection.teamId : null;
  const selectedCandidate = selectedTeamId ? candidates.get(selectedTeamId) : undefined;
  const selectedTeamDoc = selectedTeamId ? teamsById.get(selectedTeamId) : undefined;
  const lockAtMillis = selectedTeamId && restrictedToDraw
    ? groupKickoffByTeam.get(selectedTeamId) ?? selection?.lockAt?.toDate?.()?.getTime?.() ?? null
    : selectedCandidate?.firstKickoff ?? selection?.lockAt?.toDate?.()?.getTime?.() ?? null;
  const locked = typeof lockAtMillis === "number" ? now >= lockAtMillis : false;
  const startsAt = [...candidates.values()].sort((a, b) => a.firstKickoff - b.firstKickoff)[0]?.firstKickoff ?? null;

  return {
    id: roundId,
    label: CARISMA_ROUND_LABELS[roundId],
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    hasResolvedMatches: candidates.size > 0,
    allocationPending: restrictedToDraw && allocationIds.size === 0,
    allocatedTeams: restrictedToDraw ? allocationTeams : [],
    selectedTeam: selectedTeamId ? {
      id: selectedTeamId,
      name: (typeof selection?.teamName === "string" && selection.teamName) || (typeof selectedTeamDoc?.name === "string" && selectedTeamDoc.name) || selectedCandidate?.name || selectedTeamId,
      iso2: (typeof selection?.teamIso2 === "string" && selection.teamIso2) || (typeof selectedTeamDoc?.iso2 === "string" && selectedTeamDoc.iso2) || selectedCandidate?.iso2 || null,
    } : null,
    locked,
    lockAt: lockAtMillis ? new Date(lockAtMillis).toISOString() : null,
    eligibleTeams,
    teams,
    sharedAcrossGroupStage: restrictedToDraw,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const [matchesSnap, selectionsSnap, teamsSnap, allocationSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("carismaSelections").where("participantId", "==", user.uid).get(),
      adminDb.collection("teams").get(),
      adminDb.collection("carismaAllocations").doc(user.uid).get(),
    ]);
    const selectionIndex = buildCarismaSelectionIndex(selectionsSnap.docs.map((doc) => doc.data()));
    const teamsById = new Map(teamsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const allocationTeams = (Array.isArray(allocationSnap.data()?.teams) ? allocationSnap.data()!.teams : []) as AllocationTeam[];
    const allocationIds = new Set(allocationTeams.map((team) => String(team.id)));
    const groupKickoffs = firstGroupKickoffByTeam(matchesSnap.docs);
    const now = Date.now();
    const rounds = CARISMA_ROUNDS.map((roundId) => {
      const normalized = selectionIndex.byRoundParticipant.get(`${roundId}:${user.uid}`);
      return buildRoundPayload(
        roundId,
        matchesSnap.docs,
        normalized?.raw ? { ...normalized.raw, teamId: normalized.teamId, teamName: normalized.teamName, teamIso2: normalized.teamIso2 } : undefined,
        teamsById,
        allocationIds,
        allocationTeams,
        groupKickoffs,
        now,
      );
    });
    return NextResponse.json({ rounds, allocationTeams, serverTime: new Date(now).toISOString() });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("carisma-get", error);
    return NextResponse.json({ error: "Não foi possível carregar o Time Carisma." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const groupStageChoice = isGroupRound(input.roundId);
    const roundIds = groupStageChoice ? [...GROUP_ROUNDS] : [input.roundId];
    const selectionRefs = roundIds.map((roundId) => adminDb.collection("carismaSelections").doc(`${roundId}_${user.uid}`));

    await adminDb.runTransaction(async (tx) => {
      const phase = groupStageChoice ? "GROUP_STAGE" : input.roundId;
      const matchesQuery = adminDb.collection("matches").where("phase", "==", phase);
      const reads = await Promise.all([
        tx.get(matchesQuery),
        tx.get(adminDb.collection("teams").doc(input.teamId)),
        tx.get(adminDb.collection("carismaAllocations").doc(user.uid)),
        ...selectionRefs.map((ref) => tx.get(ref)),
      ]);
      const matchesSnap = reads[0] as FirebaseFirestore.QuerySnapshot;
      const teamSnap = reads[1] as FirebaseFirestore.DocumentSnapshot;
      const allocationSnap = reads[2] as FirebaseFirestore.DocumentSnapshot;
      const existingSelections = reads.slice(3) as FirebaseFirestore.DocumentSnapshot[];

      if (!teamSnap.exists || teamSnap.data()?.active === false || teamSnap.data()?.eliminatedAt) throw new Error("TEAM_NOT_ELIGIBLE");
      if (groupStageChoice) {
        const allocatedIds = new Set((Array.isArray(allocationSnap.data()?.teams) ? allocationSnap.data()!.teams : []).map((team: any) => String(team.id)));
        if (!allocatedIds.size) throw new Error("CARISMA_DRAW_PENDING");
        if (!allocatedIds.has(input.teamId)) throw new Error("TEAM_NOT_ALLOCATED");
      }

      const relevantMatches = groupStageChoice
        ? matchesSnap.docs.filter((doc) => doc.data().teamsResolved !== false)
        : matchesSnap.docs.filter((doc) => matchBelongsToCarismaRound(doc.data(), input.roundId));
      const teamMatches = relevantMatches.filter((doc) => {
        const match = doc.data();
        return [match.homeTeamId, match.awayTeamId].includes(input.teamId);
      });
      if (!teamMatches.length) throw new Error("TEAM_NOT_IN_ROUND");
      const firstKickoff = Math.min(...teamMatches.map((doc) => (doc.data().kickoffAt.toDate() as Date).getTime()));
      const now = Date.now();
      if (now >= firstKickoff) throw new Error("TEAM_ALREADY_PLAYED");

      const canonicalExisting = existingSelections.find((snapshot) => snapshot.exists);
      if (canonicalExisting?.exists) {
        const oldTeamId = canonicalExisting.data()!.teamId as string;
        const oldMatches = relevantMatches.filter((doc) => {
          const match = doc.data();
          return [match.homeTeamId, match.awayTeamId].includes(oldTeamId);
        });
        if (oldMatches.length) {
          const oldFirstKickoff = Math.min(...oldMatches.map((doc) => (doc.data().kickoffAt.toDate() as Date).getTime()));
          if (now >= oldFirstKickoff) throw new Error("SELECTION_LOCKED");
        }
      }

      const teamData = teamSnap.data()!;
      const selectedAt = canonicalExisting?.exists ? canonicalExisting.data()!.selectedAt : FieldValue.serverTimestamp();
      selectionRefs.forEach((selectionRef, index) => {
        tx.set(selectionRef, {
          roundId: roundIds[index],
          participantId: user.uid,
          teamId: input.teamId,
          teamName: teamData.name ?? input.teamId,
          teamIso2: teamData.iso2 ?? null,
          lockAt: new Date(firstKickoff),
          selectedAt,
          updatedAt: FieldValue.serverTimestamp(),
          sharedAcrossGroupStage: groupStageChoice,
        }, { merge: true });
      });
      tx.set(adminDb.collection("auditLogs").doc(), {
        type: canonicalExisting?.exists ? "CARISMA_SELECTION_CHANGED" : "CARISMA_SELECTION_CREATED",
        actorUid: user.uid,
        roundId: groupStageChoice ? "GROUP_STAGE" : input.roundId,
        synchronizedRounds: groupStageChoice ? GROUP_ROUNDS : null,
        previousTeamId: canonicalExisting?.exists ? canonicalExisting.data()!.teamId : null,
        teamId: input.teamId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ ok: true, synchronizedGroupRounds: groupStageChoice });
  } catch (error) {
    const code = (error as Error).message;
    const messages: Record<string, string> = {
      TEAM_NOT_ELIGIBLE: "A seleção não está mais viva.",
      TEAM_NOT_IN_ROUND: "A seleção não joga nesta rodada.",
      TEAM_ALREADY_PLAYED: "O primeiro jogo desta seleção já começou.",
      SELECTION_LOCKED: "Sua escolha já foi bloqueada porque o primeiro jogo do Time Carisma começou.",
      CARISMA_DRAW_PENDING: "Os três Times Carisma ainda não foram sorteados para você.",
      TEAM_NOT_ALLOCATED: "Na fase de grupos, você só pode escolher entre as três seleções sorteadas.",
    };
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return NextResponse.json({ error: messages[code] ?? "Não foi possível escolher o Time Carisma." }, { status: 409 });
  }
}
