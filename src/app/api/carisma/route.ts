import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import {
  CARISMA_ROUNDS,
  CARISMA_ROUND_LABELS,
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

function buildRoundPayload(
  roundId: CarismaRoundId,
  matchDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  selection: FirebaseFirestore.DocumentData | undefined,
  teamsById: Map<string, FirebaseFirestore.DocumentData>,
  now: number,
) {
  const candidates = new Map<string, TeamCandidate>();

  for (const doc of matchDocs) {
    const match = doc.data();
    if (
      !matchBelongsToCarismaRound(match, roundId) ||
      match.teamsResolved === false
    )
      continue;
    const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
    if (!kickoff) continue;

    const entries = [
      {
        id: match.homeTeamId,
        name: match.homeTeamName,
        iso2: match.homeTeamIso2,
      },
      {
        id: match.awayTeamId,
        name: match.awayTeamName,
        iso2: match.awayTeamIso2,
      },
    ];

    for (const entry of entries) {
      if (!entry.id) continue;
      const existing = candidates.get(entry.id);
      const timestamp = kickoff.getTime();
      if (!existing || timestamp < existing.firstKickoff) {
        const teamDoc = teamsById.get(entry.id);
        candidates.set(entry.id, {
          id: entry.id,
          name:
            typeof teamDoc?.name === "string"
              ? teamDoc.name
              : (entry.name ?? entry.id),
          iso2:
            typeof teamDoc?.iso2 === "string"
              ? teamDoc.iso2
              : (entry.iso2 ?? null),
          group: typeof match.group === "string" ? match.group : null,
          firstKickoff: timestamp,
        });
      }
    }
  }

  const teams = [...candidates.values()]
    .sort(
      (a, b) =>
        a.firstKickoff - b.firstKickoff ||
        a.name.localeCompare(b.name, "pt-BR"),
    )
    .map((team) => {
      const teamDoc = teamsById.get(team.id);
      const eliminated =
        teamDoc?.active === false || Boolean(teamDoc?.eliminatedAt);
      const alreadyPlayed = team.firstKickoff <= now;
      return {
        id: team.id,
        name: team.name,
        iso2: team.iso2,
        group: team.group,
        firstKickoff: new Date(team.firstKickoff).toISOString(),
        eligible: !eliminated && !alreadyPlayed,
        unavailableReason: eliminated
          ? "Seleção eliminada"
          : alreadyPlayed
            ? "Jogo já iniciado"
            : null,
      };
    });

  const eligibleTeams = teams.filter((team) => team.eligible);

  const selectedTeamId =
    typeof selection?.teamId === "string" ? selection.teamId : null;
  const selectedCandidate = selectedTeamId
    ? candidates.get(selectedTeamId)
    : undefined;
  const selectedTeamDoc = selectedTeamId
    ? teamsById.get(selectedTeamId)
    : undefined;
  const lockAtMillis =
    selectedCandidate?.firstKickoff ??
    selection?.lockAt?.toDate?.()?.getTime?.() ??
    null;
  const locked = typeof lockAtMillis === "number" ? now >= lockAtMillis : false;
  const startsAt =
    [...candidates.values()].sort((a, b) => a.firstKickoff - b.firstKickoff)[0]
      ?.firstKickoff ?? null;

  return {
    id: roundId,
    label: CARISMA_ROUND_LABELS[roundId],
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    hasResolvedMatches: candidates.size > 0,
    selectedTeam: selectedTeamId
      ? {
          id: selectedTeamId,
          name:
            (typeof selection?.teamName === "string" && selection.teamName) ||
            (typeof selectedTeamDoc?.name === "string" &&
              selectedTeamDoc.name) ||
            selectedCandidate?.name ||
            selectedTeamId,
          iso2:
            (typeof selection?.teamIso2 === "string" && selection.teamIso2) ||
            (typeof selectedTeamDoc?.iso2 === "string" &&
              selectedTeamDoc.iso2) ||
            selectedCandidate?.iso2 ||
            null,
        }
      : null,
    locked,
    lockAt: lockAtMillis ? new Date(lockAtMillis).toISOString() : null,
    eligibleTeams,
    teams,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const [matchesSnap, selectionsSnap, teamsSnap] = await Promise.all([
      adminDb
        .collection("matches")
        .orderBy("kickoffAt", "asc")
        .limit(160)
        .get(),
      adminDb
        .collection("carismaSelections")
        .where("participantId", "==", user.uid)
        .get(),
      adminDb.collection("teams").get(),
    ]);

    const selectionsByRound = new Map(
      selectionsSnap.docs.map((doc) => [
        String(doc.data().roundId),
        doc.data(),
      ]),
    );
    const teamsById = new Map(
      teamsSnap.docs.map((doc) => [doc.id, doc.data()]),
    );
    const now = Date.now();

    const rounds = CARISMA_ROUNDS.map((roundId) =>
      buildRoundPayload(
        roundId,
        matchesSnap.docs,
        selectionsByRound.get(roundId),
        teamsById,
        now,
      ),
    );

    return NextResponse.json({
      rounds,
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("carisma-get", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o Time Carisma." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const selectionRef = adminDb
      .collection("carismaSelections")
      .doc(`${input.roundId}_${user.uid}`);

    await adminDb.runTransaction(async (tx) => {
      const phase = isGroupRound(input.roundId) ? "GROUP_STAGE" : input.roundId;
      const matchesQuery = adminDb
        .collection("matches")
        .where("phase", "==", phase);
      const [matchesSnap, teamSnap, existing] = await Promise.all([
        tx.get(matchesQuery),
        tx.get(adminDb.collection("teams").doc(input.teamId)),
        tx.get(selectionRef),
      ]);

      if (
        !teamSnap.exists ||
        teamSnap.data()?.active === false ||
        teamSnap.data()?.eliminatedAt
      ) {
        throw new Error("TEAM_NOT_ELIGIBLE");
      }

      const roundMatches = matchesSnap.docs.filter((doc) =>
        matchBelongsToCarismaRound(doc.data(), input.roundId),
      );
      const teamMatches = roundMatches.filter((doc) => {
        const match = doc.data();
        return (
          match.teamsResolved !== false &&
          [match.homeTeamId, match.awayTeamId].includes(input.teamId)
        );
      });
      if (!teamMatches.length) throw new Error("TEAM_NOT_IN_ROUND");

      const firstKickoff = Math.min(
        ...teamMatches.map((doc) =>
          (doc.data().kickoffAt.toDate() as Date).getTime(),
        ),
      );
      const now = Date.now();
      if (now >= firstKickoff) throw new Error("TEAM_ALREADY_PLAYED");

      if (existing.exists) {
        const oldTeamId = existing.data()!.teamId as string;
        const oldMatches = roundMatches.filter((doc) => {
          const match = doc.data();
          return (
            match.teamsResolved !== false &&
            [match.homeTeamId, match.awayTeamId].includes(oldTeamId)
          );
        });
        if (oldMatches.length) {
          const oldFirstKickoff = Math.min(
            ...oldMatches.map((doc) =>
              (doc.data().kickoffAt.toDate() as Date).getTime(),
            ),
          );
          if (now >= oldFirstKickoff) throw new Error("SELECTION_LOCKED");
        }
      }

      const teamData = teamSnap.data()!;
      tx.set(
        selectionRef,
        {
          roundId: input.roundId,
          participantId: user.uid,
          teamId: input.teamId,
          teamName: teamData.name ?? input.teamId,
          teamIso2: teamData.iso2 ?? null,
          lockAt: new Date(firstKickoff),
          selectedAt: existing.exists
            ? existing.data()!.selectedAt
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(adminDb.collection("auditLogs").doc(), {
        type: existing.exists
          ? "CARISMA_SELECTION_CHANGED"
          : "CARISMA_SELECTION_CREATED",
        actorUid: user.uid,
        roundId: input.roundId,
        previousTeamId: existing.exists ? existing.data()!.teamId : null,
        teamId: input.teamId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as Error).message;
    const messages: Record<string, string> = {
      TEAM_NOT_ELIGIBLE: "A seleção não está mais viva.",
      TEAM_NOT_IN_ROUND: "A seleção não joga nesta rodada.",
      TEAM_ALREADY_PLAYED: "Esta seleção já entrou em campo nesta rodada.",
      SELECTION_LOCKED:
        "Sua escolha já foi bloqueada porque o Time Carisma entrou em campo nesta rodada.",
    };
    if (code === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json(
      { error: messages[code] ?? "Não foi possível escolher o Time Carisma." },
      { status: 409 },
    );
  }
}
