// Family photos at the command post. Each photo is named by the SHA-256 of
// its JPEG bytes, read through the Storage SDK (rules apply; never a download
// URL, which would bypass them), and its reading is kept command-only for 30
// days.

import type { PhotoCues, RouteRecord } from "@pls/engine";
import { collection, getDocFromServer, doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { getBytes, getMetadata, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

const HASH = /^[0-9a-f]{64}$/;
const DAY_MS = 24 * 3600_000;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function photoPath(incidentId: string, sha256: string): string {
  if (!HASH.test(sha256)) throw new Error("A photo is named by its SHA-256.");
  return `photos/${incidentId}/${sha256}.jpg`;
}

export type FamilyDecision = "yes" | "no" | "not_sure";

export function photoReadingDoc(incidentId: string, sha256: string, cues: PhotoCues | null, route: RouteRecord | null, familyDecision: FamilyDecision | null, nowMs: number) {
  return { sha256, storagePath: photoPath(incidentId, sha256), cues, route, familyDecision, expiresAt: new Date(nowMs + 30 * DAY_MS) };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Every photo under the incident, as its hash and bytes, read through the Storage SDK. */
export async function loadPhotos(storage: FirebaseStorage, incidentId: string): Promise<{ sha256: string; bytes: Uint8Array }[]> {
  const list = await listAll(ref(storage, `photos/${incidentId}`));
  const out: { sha256: string; bytes: Uint8Array }[] = [];
  for (const item of list.items) {
    const sha = item.name.replace(/\.jpg$/, "");
    if (!HASH.test(sha)) continue;
    out.push({ sha256: sha, bytes: new Uint8Array(await getBytes(item, 2 * 1024 * 1024)) });
  }
  return out;
}

/**
 * Whether a stored object is still there. Command can delete a search's media at any time, from any seat, so a
 * photo held in a tray is checked again right before its bytes go to the cloud or a reading is saved for it.
 * Any failure other than "not found" is thrown: a check that could not run proves neither.
 */
export async function stillStored(metadata: () => Promise<unknown>): Promise<boolean> {
  try {
    await metadata();
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "storage/object-not-found") return false;
    throw e;
  }
}

/** Said when command deleted the search's photos after this seat loaded them. */
export const PHOTO_DELETED = "This photo was deleted.";
/** Said when the Storage check could not run (the link is down, say): nothing was saved. */
export const PHOTO_UNCHECKED = "Could not check this photo. The answer was not saved. Try again.";

/**
 * Saves a family answer only after Storage confirms the photo is still there. A check that cannot run refuses
 * too: a queued answer could land after another seat deleted the photo and bring its reading back.
 */
export async function saveIfStillStored(stillThere: () => Promise<boolean>, save: () => Promise<void>): Promise<void> {
  let there: boolean;
  try {
    there = await stillThere();
  } catch {
    throw new Error(PHOTO_UNCHECKED);
  }
  if (!there) throw new Error(PHOTO_DELETED);
  await save();
}

/** The family's cloud consent for one photo: who agreed, and when (their own tap in the family app). */
export type PhotoConsent = { byUid: string; atMs: number };

/**
 * The cloud consent in a photoConsents record, or null. Only the family member who shared the photo writes the
 * record (incidents/{id}/photoConsents/{sha256}); it counts only for this photo's own Storage path and only
 * when the consent mark is that sharer's.
 */
export function photoConsentFromDoc(incidentId: string, sha256: string, data: unknown): PhotoConsent | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const c = d["cloudProcessing"] as Record<string, unknown> | undefined;
  if (d["storagePath"] !== photoPath(incidentId, sha256)) return null;
  if (typeof d["createdByUid"] !== "string" || !c || typeof c !== "object") return null;
  if (c["byUid"] !== d["createdByUid"] || typeof c["atMs"] !== "number" || !Number.isFinite(c["atMs"])) return null;
  return { byUid: c["byUid"] as string, atMs: c["atMs"] as number };
}

/** The family's consent for a cloud read of this photo, read from the server only; rejects when unreachable. */
export async function confirmPhotoConsent(db: Firestore, incidentId: string, sha256: string): Promise<PhotoConsent | null> {
  const snap = await getDocFromServer(doc(db, "incidents", incidentId, "photoConsents", sha256));
  return snap.exists() ? photoConsentFromDoc(incidentId, sha256, snap.data()) : null;
}

/** Is this incident's photo still in Storage? */
export function photoStillStored(storage: FirebaseStorage, incidentId: string, sha256: string): Promise<boolean> {
  return stillStored(() => getMetadata(ref(storage, photoPath(incidentId, sha256))));
}

/** Photos are create-only and named by content, so an existing object is the same photo: skip it. */
export async function uploadPhoto(storage: FirebaseStorage, incidentId: string, jpeg: Uint8Array): Promise<string> {
  const sha = await sha256Hex(jpeg);
  const target = ref(storage, photoPath(incidentId, sha));
  try {
    await getMetadata(target);
    return sha;
  } catch (e) {
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
  await uploadBytes(target, jpeg, { contentType: "image/jpeg" });
  return sha;
}

export async function savePhotoReading(db: Firestore, incidentId: string, reading: ReturnType<typeof photoReadingDoc>): Promise<void> {
  await setDoc(doc(db, "incidents", incidentId, "photoReadings", reading.sha256), reading);
}

/** The photos command has saved a reading of (by sha256), live; the Details summary counts the rest as to review. */
export function subscribePhotoReadingIds(db: Firestore, incidentId: string, cb: (ids: ReadonlySet<string>) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(collection(db, "incidents", incidentId, "photoReadings"), (s) => cb(new Set(s.docs.map((d) => d.id))), onError);
}

/** A failed load is said in plain words; it is never shown as an empty tray. */
export async function loadPhotosOrError(load: () => Promise<{ sha256: string; bytes: Uint8Array }[]>): Promise<{ photos: { sha256: string; bytes: Uint8Array }[]; error: string | null }> {
  try {
    return { photos: await load(), error: null };
  } catch {
    return { photos: [], error: "Photos could not be loaded. Reload to try again." };
  }
}
