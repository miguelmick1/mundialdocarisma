import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { loadRoundInsightsData } from "@/lib/competition/round-insights-server";
import { buildRoundCatalog, buildRoundSummary } from "@/lib/competition/round-insights";
import {
  buildBulletinSuggestions,
  bulletinHeading,
  normalizeBulletinFields,
  parseBulletinRound,
  type BulletinFields,
} from "@/lib/bulletin/round-bulletin";
import { type CarismaRoundId } from "@/lib/world-cup/rounds";

type StoredBulletinDoc = {
  roundId?: string;
  draftFields?: Partial<BulletinFields>;
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedByUid?: string;
  publicationId?: string;
  publishedAt?: FirebaseFirestore.Timestamp;
  publishedByUid?: string;
  publishedFields?: Partial<BulletinFields>;
};

function timestampToIso(value: FirebaseFirestore.Timestamp | undefined) {
  return value?.toDate?.().toISOString?.() ?? null;
}

function bulletinCollection() {
  return adminDb.collection("roundBulletins");
}

export async function loadAdminRoundBulletin(requestedRoundId?: string | null) {
  const { participants, matches, guesses, scoreEvents } = await loadRoundInsightsData();
  const catalog = buildRoundCatalog(matches);
  const roundId = parseBulletinRound(requestedRoundId) ?? catalog.defaultRoundId;
  const summary = buildRoundSummary(roundId, participants, matches, guesses, scoreEvents);
  const suggestions = buildBulletinSuggestions(summary);
  const heading = bulletinHeading(roundId);
  const snap = await bulletinCollection().doc(roundId).get();
  const data = (snap.data() ?? {}) as StoredBulletinDoc;

  return {
    rounds: catalog.rounds,
    selectedRoundId: roundId,
    summary,
    heading,
    suggestions,
    draft: {
      fields: snap.exists ? normalizeBulletinFields(data.draftFields) : suggestions,
      updatedAt: timestampToIso(data.updatedAt),
      updatedByUid: data.updatedByUid ?? null,
    },
    publication: data.publicationId && data.publishedAt
      ? {
        publicationId: data.publicationId,
        publishedAt: timestampToIso(data.publishedAt),
        publishedByUid: data.publishedByUid ?? null,
        fields: normalizeBulletinFields(data.publishedFields),
      }
      : null,
  };
}

export async function saveRoundBulletin(params: {
  roundId: CarismaRoundId;
  fields: BulletinFields;
  actorUid: string;
  publish: boolean;
}) {
  const ref = bulletinCollection().doc(params.roundId);
  const normalizedFields = normalizeBulletinFields(params.fields);
  const publicationId = params.publish ? randomUUID() : null;
  const payload: Record<string, unknown> = {
    roundId: params.roundId,
    draftFields: normalizedFields,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: params.actorUid,
  };

  if (params.publish) {
    payload.publicationId = publicationId;
    payload.publishedAt = FieldValue.serverTimestamp();
    payload.publishedByUid = params.actorUid;
    payload.publishedFields = normalizedFields;
  }

  await ref.set(payload, { merge: true });
  await adminDb.collection("auditLogs").add({
    type: params.publish ? "ROUND_BULLETIN_PUBLISHED" : "ROUND_BULLETIN_SAVED",
    actorUid: params.actorUid,
    roundId: params.roundId,
    publicationId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { publicationId };
}

export async function loadPrintRoundBulletin(roundId: CarismaRoundId) {
  const payload = await loadAdminRoundBulletin(roundId);
  return {
    roundId,
    heading: payload.heading,
    fields: payload.draft.fields,
    publication: payload.publication,
  };
}

export async function loadLatestUnreadPublishedBulletin(userId: string) {
  const [bulletinsSnap, dismissalsSnap] = await Promise.all([
    bulletinCollection().get(),
    adminDb.collection("roundBulletinDismissals").where("userId", "==", userId).get(),
  ]);
  const dismissed = new Set(
    dismissalsSnap.docs
      .map((doc) => doc.data().publicationId)
      .filter((value): value is string => typeof value === "string" && Boolean(value)),
  );

  const bulletins = bulletinsSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as StoredBulletinDoc }))
    .filter((row) => row.data.publicationId && row.data.publishedAt && row.data.publishedFields)
    .filter((row) => !dismissed.has(row.data.publicationId!))
    .sort((a, b) => b.data.publishedAt!.toMillis() - a.data.publishedAt!.toMillis());

  const next = bulletins[0];
  if (!next) return null;

  const roundId = parseBulletinRound(next.id);
  if (!roundId) return null;

  return {
    roundId,
    publicationId: next.data.publicationId!,
    publishedAt: timestampToIso(next.data.publishedAt),
    heading: bulletinHeading(roundId),
    fields: normalizeBulletinFields(next.data.publishedFields),
  };
}

export async function dismissPublishedBulletin(userId: string, publicationId: string) {
  const bulletin = await bulletinCollection().where("publicationId", "==", publicationId).limit(1).get();
  if (bulletin.empty) throw new Error("BULLETIN_NOT_FOUND");

  await adminDb.collection("roundBulletinDismissals").doc(`${userId}_${publicationId}`).set({
    userId,
    publicationId,
    roundId: bulletin.docs[0]!.id,
    dismissedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
