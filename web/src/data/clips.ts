// Camera clips at the command post (spec section 12.1, rules ruling I9). A clip is named by
// the SHA-256 of its bytes. Its record, incidents/{id}/clipReadings/{sha256}, is created as a
// consent record before the upload (Storage refuses a clip without it), completed once with
// the reading and the route, and is read-only after that. Clips are create-only in Storage.

import type { ConsentMark, RouteRecord } from "@pls/engine";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, type FieldValue, type Firestore } from "firebase/firestore";
import { getMetadata, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

const HASH = /^[0-9a-f]{64}$/;

/** 32 days: the rules accept a clip record's expiresAt only between server time + 31 and + 33 days. */
export const READING_TTL_MS = 32 * 24 * 3600 * 1000;
/** Storage refuses the clip until its consent record exists, so the write is awaited, within this bound. */
export const CONSENT_WRITE_TIMEOUT_MS = 20_000;

/** The four consents as stored (the clip's hash is the record id, so it is not repeated here); public use is needed only for a clip shown in the film or on the judge page. */
export type StoredConsent = {
  personInClip: ConsentMark | null;
  footageOwner: ConsentMark | null;
  cloudProcessing: ConsentMark | null;
  publicUse: ConsentMark | null;
};

export type ClipRecordInput = {
  incidentId: string;
  sha256: string;
  durationS: number;
  clipStartMs: number;
  clockConfirmed: boolean;
  /** One of the 8 compass points, or null when the facing is not known (then there is no bearing). */
  cameraFacingDeg: number | null;
  consent: StoredConsent;
  uid: string;
  nowMs: number;
};

export type StoredClipReading = {
  sha256: string;
  storagePath: string;
  durationS: number;
  clipStartMs: number;
  clockConfirmed: boolean;
  cameraFacingDeg: number | null;
  reading: Record<string, unknown> | null;
  route: RouteRecord | null;
  consent: StoredConsent;
  expiresAtMs: number;
  createdAtMs: number;
  createdByUid: string;
};

/** The consent record as written: no reading or route yet, a timestamp expiry, the server's createdAt. */
export type ClipRecordDoc = Omit<StoredClipReading, "expiresAtMs" | "createdAtMs" | "reading" | "route"> & {
  reading: null;
  route: null;
  expiresAt: Timestamp;
  createdAt: FieldValue;
};

export function clipPath(incidentId: string, sha256: string): string {
  if (!HASH.test(sha256)) throw new Error("A clip is named by its SHA-256.");
  return `clips/${incidentId}/${sha256}.mp4`;
}

/** The consent record, written before the upload with exactly the rules' keys. */
export function consentRecord(i: ClipRecordInput): ClipRecordDoc {
  return {
    sha256: i.sha256,
    storagePath: clipPath(i.incidentId, i.sha256),
    durationS: i.durationS,
    clipStartMs: i.clipStartMs,
    clockConfirmed: i.clockConfirmed,
    cameraFacingDeg: i.cameraFacingDeg,
    reading: null,
    route: null,
    consent: i.consent,
    expiresAt: Timestamp.fromMillis(i.nowMs + READING_TTL_MS),
    createdAt: serverTimestamp(),
    createdByUid: i.uid,
  };
}

/**
 * A retry renews an earlier attempt's record (no reading yet): fresh consent, a new expiry and
 * a new createdAt, every other field exactly as stored (the rules refuse any other change).
 */
export function renewConsent(stored: StoredClipReading, consent: StoredConsent, nowMs: number): ClipRecordDoc {
  return {
    sha256: stored.sha256,
    storagePath: stored.storagePath,
    durationS: stored.durationS,
    clipStartMs: stored.clipStartMs,
    clockConfirmed: stored.clockConfirmed,
    cameraFacingDeg: stored.cameraFacingDeg,
    reading: null,
    route: null,
    consent,
    expiresAt: Timestamp.fromMillis(nowMs + READING_TTL_MS),
    createdAt: serverTimestamp(),
    createdByUid: stored.createdByUid,
  };
}

/** The one completion: only the reading (an object) and the route. */
export function completion(reading: Record<string, unknown>, route: RouteRecord): { reading: Record<string, unknown>; route: RouteRecord } {
  return { reading, route };
}

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);
const isMark = (v: unknown): v is ConsentMark | null =>
  v === null || (typeof v === "object" && typeof (v as ConsentMark).byUid === "string" && typeof (v as ConsentMark).atMs === "number");

export function clipReadingFromDoc(d: Record<string, unknown> | undefined): StoredClipReading | null {
  if (!d) return null;
  const c = d["consent"] as Record<string, unknown> | undefined;
  const expiresAtMs = ms(d["expiresAt"]);
  const createdAtMs = ms(d["createdAt"]);
  const facing = d["cameraFacingDeg"];
  const ok =
    typeof d["sha256"] === "string" && typeof d["storagePath"] === "string" && typeof d["durationS"] === "number" &&
    typeof d["clipStartMs"] === "number" && typeof d["clockConfirmed"] === "boolean" && (facing === null || typeof facing === "number") &&
    typeof d["createdByUid"] === "string" && expiresAtMs !== null && createdAtMs !== null && !!c &&
    isMark(c["personInClip"] ?? null) && isMark(c["footageOwner"] ?? null) && isMark(c["cloudProcessing"] ?? null) && isMark(c["publicUse"] ?? null);
  if (!ok) return null;
  return {
    sha256: d["sha256"] as string,
    storagePath: d["storagePath"] as string,
    durationS: d["durationS"] as number,
    clipStartMs: d["clipStartMs"] as number,
    clockConfirmed: d["clockConfirmed"] as boolean,
    cameraFacingDeg: facing as number | null,
    reading: (d["reading"] as Record<string, unknown> | null) ?? null,
    route: (d["route"] as RouteRecord | null) ?? null,
    consent: {
      personInClip: (c!["personInClip"] as ConsentMark | null) ?? null,
      footageOwner: (c!["footageOwner"] as ConsentMark | null) ?? null,
      cloudProcessing: (c!["cloudProcessing"] as ConsentMark | null) ?? null,
      publicUse: (c!["publicUse"] as ConsentMark | null) ?? null,
    },
    expiresAtMs: expiresAtMs!,
    createdAtMs: createdAtMs!,
    createdByUid: d["createdByUid"] as string,
  };
}

const recordRef = (db: Firestore, incidentId: string, sha256: string) => doc(db, "incidents", incidentId, "clipReadings", sha256);

export async function findClipReading(db: Firestore, incidentId: string, sha256: string): Promise<StoredClipReading | null> {
  const snap = await getDoc(recordRef(db, incidentId, sha256));
  return snap.exists() ? clipReadingFromDoc(snap.data()) : null;
}

/** Writes (or renews) the consent record and waits for the server, within CONSENT_WRITE_TIMEOUT_MS. */
export async function writeConsentRecord(db: Firestore, incidentId: string, record: ClipRecordDoc, timeoutMs = CONSENT_WRITE_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The consent record was not saved in time.")), timeoutMs);
  });
  try {
    await Promise.race([setDoc(recordRef(db, incidentId, record.sha256), record), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether an earlier attempt already stored this clip (clips are create-only). */
export async function clipExists(storage: FirebaseStorage, path: string): Promise<boolean> {
  try {
    await getMetadata(ref(storage, path));
    return true;
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "storage/object-not-found") return false;
    throw e;
  }
}

export async function uploadClip(storage: FirebaseStorage, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await uploadBytes(ref(storage, path), bytes, { contentType });
}

export async function completeClipReading(db: Firestore, incidentId: string, sha256: string, reading: Record<string, unknown>, route: RouteRecord): Promise<void> {
  await updateDoc(recordRef(db, incidentId, sha256), completion(reading, route));
}
