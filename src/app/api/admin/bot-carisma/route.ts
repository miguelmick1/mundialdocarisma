import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import {
  GROUP_ROUNDS,
  KNOCKOUT_ROUNDS,
  isKnockoutRound,
  type CarismaRoundId,
} from "@/lib/world-cup/rounds";

export const runtime = "nodejs";

const allowedRoundIds = ["GROUP_1", ...KNOCKOUT_ROUNDS] as const;
const schema = z.object({
  botId: z.string().min(1),
  roundId: z.enum(allowedRoundIds),
  teamId: z.string().min(1),
});

function matchInAdministrativeRound(match: FirebaseFirestore.DocumentData, roundId: CarismaRoundId) {
  return roundId === "GROUP_1"
    ? match.phase === "GROUP_STAGE"
    : match.phase === roundId;
}

function firstKickoffForTeam(
  matchDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  roundId: CarismaRoundId,
  teamId: string,
) {
  const times = matchDocs.flatMap((doc) => {
    const match = doc.data();
    if (!matchInAdministrativeRound(match, roundId) || match.teamsResolved === false) return [];
    if (![match.homeTeamId, match.awayTeamId].includes(teamId)) return [];
    const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
    return kickoff ? [kickoff.getTime()] : [];
  });
  return times.length ? Math.min(...times) : null;
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const groupStage = input.roundId === "GROUP_1";
    const roundIds = groupStage ? [...GROUP_ROUNDS] : [input.roundId];
    const selectionRefs = roundIds.map((roundId) => adminDb.collection("carismaSelections").doc(`${roundId}_${input.botId}`));

    await adminDb.runTransaction(async (tx) => {
      const phase = groupStage ? "GROUP_STAGE" : input.roundId;
      const matchesQuery = adminDb.collection("matches").where("phase", "==", phase);
      const reads = await Promise.all([
        tx.get(matchesQuery),
        tx.get(adminDb.collection("teams").doc(input.teamId)),
        tx.get(adminDb.collection("participants").doc(input.botId)),
        ...selectionRefs.map((ref) => tx.get(ref)),
      ]);
      const matchesSnap = reads[0] as FirebaseFirestore.QuerySnapshot;
      const teamSnap = reads[1] as FirebaseFirestore.DocumentSnapshot;
      const botSnap = reads[2] as FirebaseFirestore.DocumentSnapshot;
      const existingSelections = reads.slice(3) as FirebaseFirestore.DocumentSnapshot[];

      if (!botSnap.exists || botSnap.data()?.type !== "BOT") throw new Error("NOT_BOT");
      if (!teamSnap.exists || teamSnap.data()?.active === false || teamSnap.data()?.eliminatedAt) throw new Error("TEAM_NOT_ELIGIBLE");

      const selectedFirstKickoff = firstKickoffForTeam(matchesSnap.docs, input.roundId, input.teamId);
      if (selectedFirstKickoff === null) throw new Error("TEAM_NOT_IN_ROUND");
      const now = Date.now();
      if (now >= selectedFirstKickoff) throw new Error("TEAM_ALREADY_PLAYED");

      const canonicalExisting = existingSelections.find((snapshot) => snapshot.exists);
      if (canonicalExisting?.exists) {
        const oldTeamId = String(canonicalExisting.data()!.teamId ?? "");
        const oldFirstKickoff = firstKickoffForTeam(matchesSnap.docs, input.roundId, oldTeamId);
        if (oldFirstKickoff !== null && now >= oldFirstKickoff) throw new Error("SELECTION_LOCKED");
      }

      const teamData = teamSnap.data()!;
      const selectedAt = canonicalExisting?.exists ? canonicalExisting.data()!.selectedAt : FieldValue.serverTimestamp();
      selectionRefs.forEach((selectionRef, index) => {
        tx.set(selectionRef, {
          roundId: roundIds[index],
          participantId: input.botId,
          teamId: input.teamId,
          teamName: teamData.name ?? input.teamId,
          teamIso2: teamData.iso2 ?? null,
          lockAt: new Date(selectedFirstKickoff),
          selectedAt,
          updatedAt: FieldValue.serverTimestamp(),
          selectedByAdminUid: actor.uid,
          sharedAcrossGroupStage: groupStage,
        }, { merge: true });
      });

      tx.set(adminDb.collection("auditLogs").doc(), {
        type: canonicalExisting?.exists ? "BOT_CARISMA_SELECTION_CHANGED" : "BOT_CARISMA_SELECTION_CREATED",
        actorUid: actor.uid,
        participantId: input.botId,
        roundId: groupStage ? "GROUP_STAGE" : input.roundId,
        synchronizedRounds: groupStage ? GROUP_ROUNDS : null,
        previousTeamId: canonicalExisting?.exists ? canonicalExisting.data()!.teamId : null,
        teamId: input.teamId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, synchronizedGroupRounds: groupStage });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const messages: Record<string, string> = {
      NOT_BOT: "O participante selecionado não é um bot.",
      TEAM_NOT_ELIGIBLE: "A seleção está eliminada ou indisponível.",
      TEAM_NOT_IN_ROUND: "A seleção não participa desta fase.",
      TEAM_ALREADY_PLAYED: "O primeiro jogo desta seleção já começou.",
      SELECTION_LOCKED: "O Time Carisma já está bloqueado porque o primeiro jogo da seleção escolhida começou.",
    };
    return NextResponse.json({ error: messages[code] ?? "Não foi possível salvar o Time Carisma do bot." }, { status: 409 });
  }
}
