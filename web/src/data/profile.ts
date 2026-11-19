// The subject profile at the command post. The engine splits it into two
// documents: profile/shared (searchers read it; it is packed) and
// profile/command (command and family only; never packed). Family-only
// fields (birthdate, medications, special concern, profile update date)
// never leave the family phone, so the command form neither shows nor stores them.

import {
  type Place,
  type ProfileFlags,
  profileForCommand,
  profileForSearchers,
  profileWarnings,
  type CommandProfile,
  type FamilyProfile,
  type ProfileWarning,
  type SharedProfile,
} from "@pls/engine";
import { doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import notesFile from "../../../shared/constants/approach-notes.json";

export function emptyProfile(): FamilyProfile {
  return {
    answersTo: "", nickname: "", ageYears: null, gender: "", appearance: "", heightFt: null, heightIn: null, weightLb: null,
    hair: "", eyeColor: "", primaryLanguage: "", clothingLastWorn: "", mobilityAids: [], dementiaType: null,
    flags: {
      mayNotRespond: true, likelyToHide: false, afraidOfUniforms: false, sensitiveToTouch: false, sensitiveToLight: false,
      likelyToFight: false, seizures: false, hallucinationsOrDelusions: false, lookingForHome: false, gaitUnsteady: false,
      freezing: false, fallRisk: false, softVoice: false, slowToRespond: false, fluctuates: false,
      medicationSensitivity: false, carriesMedicalAlertCard: false, medicationTimingMatters: false,
    },
    triggersToAvoid: "", bestApproach: "", uniqueDescription: "", photoTakenOn: null,
    previousAddresses: [], placesFrequented: [], pastWandering: [], nearbyWater: "", vehicle: null,
    shareDementiaType: false, birthdate: null, profileUpdatedOn: null, medications: "", howMedicationAffectsActions: "", specialConcern: "",
  };
}

export function profileDocs(p: FamilyProfile): { shared: SharedProfile; command: CommandProfile } {
  return { shared: profileForSearchers(p), command: profileForCommand(p) };
}

// The rules let profile documents be written in parts, so every reader goes through
// these two: a missing or wrong-typed field reads as its empty value, never a crash.
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = <T,>(v: unknown, keep: (x: unknown) => x is T = (x: unknown): x is T => true): T[] => (Array.isArray(v) ? v.filter(keep) : []);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const AIDS = new Set(["cane", "walker", "wheelchair", "other"]);
const isPlace = (x: unknown): x is Place => typeof x === "object" && x !== null && typeof (x as Place).label === "string";

export function sharedFromDoc(data: unknown): SharedProfile {
  const d = obj(data);
  const flagsIn = obj(d["flags"]);
  // An unstated flag reads as false: the reader never assumes a behaviour the family did not state.
  const flags = Object.fromEntries(Object.keys(emptyProfile().flags).map((k) => [k, flagsIn[k] === true])) as unknown as ProfileFlags;
  return {
    answersTo: str(d["answersTo"]), nickname: str(d["nickname"]), ageYears: num(d["ageYears"]), gender: str(d["gender"]),
    appearance: str(d["appearance"]), heightFt: num(d["heightFt"]), heightIn: num(d["heightIn"]), weightLb: num(d["weightLb"]),
    hair: str(d["hair"]), eyeColor: str(d["eyeColor"]), primaryLanguage: str(d["primaryLanguage"]), clothingLastWorn: str(d["clothingLastWorn"]),
    mobilityAids: arr(d["mobilityAids"], (x): x is SharedProfile["mobilityAids"][number] => typeof x === "string" && AIDS.has(x)),
    dementiaType: typeof d["dementiaType"] === "string" ? (d["dementiaType"] as SharedProfile["dementiaType"]) : null,
    flags,
    triggersToAvoid: str(d["triggersToAvoid"]), bestApproach: str(d["bestApproach"]), uniqueDescription: str(d["uniqueDescription"]),
    photoTakenOn: typeof d["photoTakenOn"] === "string" ? d["photoTakenOn"] : null,
    approachNoteIds: arr(d["approachNoteIds"], (x): x is string => typeof x === "string"),
    // Kept when stored (the family app writes the list), so a later save from here writes it back: the shared
    // document is replaced whole, and dropping the list here would erase the names. Absent stays absent.
    ...(Array.isArray(d["otherNames"]) ? { otherNames: arr(d["otherNames"], (x): x is string => typeof x === "string") } : {}),
  };
}

export function commandFromDoc(data: unknown): CommandProfile {
  const d = obj(data);
  const v = obj(d["vehicle"]);
  return {
    previousAddresses: arr(d["previousAddresses"], isPlace),
    placesFrequented: arr(d["placesFrequented"], isPlace),
    pastWandering: arr(d["pastWandering"], (x): x is CommandProfile["pastWandering"][number] => typeof x === "object" && x !== null && typeof (x as { foundWhere?: unknown }).foundWhere === "string"),
    nearbyWater: str(d["nearbyWater"]),
    vehicle: d["vehicle"] && typeof v["involved"] === "boolean" ? { involved: v["involved"], description: str(v["description"]) } : null,
  };
}

/** The form's profile from the two stored documents. Family-only fields stay empty at command. */
export function profileFromDocs(shared: Partial<SharedProfile> | undefined, command: Partial<CommandProfile> | undefined): FamilyProfile {
  const base = emptyProfile();
  const { approachNoteIds: _ids, ...s } = shared ?? {};
  return {
    ...base,
    ...s,
    flags: { ...base.flags, ...(shared?.flags ?? {}) },
    ...(command ?? {}),
    shareDementiaType: shared?.dementiaType != null,
  };
}

type NoteFile = { footer: string; firstScreenMax: number; notes: Record<string, { text: string; sourceRole: string }> };
const NOTES = notesFile as unknown as NoteFile;
export const APPROACH_FOOTER = NOTES.footer;

export type ApproachLine = { id: string; text: string; sourceRole: string };

/** The approach card's lines from the shared document: code and fixed copy, no model. */
export function approachLines(shared: SharedProfile): { first: ApproachLine[]; more: ApproachLine[] } {
  const fields = shared as unknown as Record<string, unknown>;
  const lines = shared.approachNoteIds.flatMap((id) => {
    const note = NOTES.notes[id];
    if (!note) return [];
    const text = note.text.replace(/\{(\w+)\}/g, (_m, k: string) => String(fields[k] ?? "")).trim();
    return text === "" ? [] : [{ id, text, sourceRole: note.sourceRole }];
  });
  return { first: lines.slice(0, NOTES.firstScreenMax), more: lines.slice(NOTES.firstScreenMax) };
}

/** Command sees only the photo-age warning; the profile update date stays on the family phone. */
export function commandWarnings(p: FamilyProfile, todayMs: number): ProfileWarning[] {
  return profileWarnings(p, todayMs).filter((w) => w === "photo_old");
}

const changedKeys = (before: object, after: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k])));

/**
 * What a save changes, per document: only the fields that differ from the profile as it was when the form
 * opened. The family app edits the same documents, so writing a whole snapshot would erase what they changed
 * meanwhile (a name added, say). The names travel together: nickname mirrors otherNames' first entry.
 */
export function profilePatch(before: FamilyProfile, after: FamilyProfile): { shared: Record<string, unknown>; command: Record<string, unknown> } {
  const a = profileDocs(before);
  const b = profileDocs(after);
  return { shared: changedKeys(a.shared, b.shared), command: changedKeys(a.command, b.command) };
}

/**
 * Saves the form. A document that already exists gets only the changed fields (merged); one that does not exist
 * yet is written whole, since the rules check the complete document.
 */
export async function writeProfile(
  db: Firestore,
  incidentId: string,
  before: FamilyProfile,
  after: FamilyProfile,
  stored: { shared: boolean; command: boolean },
): Promise<void> {
  const full = profileDocs(after);
  const patch = profilePatch(before, after);
  const writes: Promise<void>[] = [];
  for (const k of ["shared", "command"] as const) {
    const ref = doc(db, "incidents", incidentId, "profile", k);
    if (!stored[k]) writes.push(setDoc(ref, full[k]));
    else if (Object.keys(patch[k]).length > 0) writes.push(setDoc(ref, patch[k], { merge: true }));
  }
  await Promise.all(writes);
}

export function subscribeProfile(
  db: Firestore,
  incidentId: string,
  cb: (docs: { shared: SharedProfile | undefined; command: CommandProfile | undefined }) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  let shared: SharedProfile | undefined;
  let command: CommandProfile | undefined;
  const a = onSnapshot(doc(db, "incidents", incidentId, "profile", "shared"), (s) => { shared = s.exists() ? sharedFromDoc(s.data()) : undefined; cb({ shared, command }); }, onError);
  const b = onSnapshot(doc(db, "incidents", incidentId, "profile", "command"), (s) => { command = s.exists() ? commandFromDoc(s.data()) : undefined; cb({ shared, command }); }, onError);
  return () => { a(); b(); };
}
