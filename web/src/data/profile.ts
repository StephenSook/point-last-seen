// The subject profile at the command post. The engine splits it into two
// documents: profile/shared (searchers read it; it is packed) and
// profile/command (command and family only; never packed). Family-only
// fields (birthdate, medications, special concern, profile update date)
// never leave the family phone, so the command form neither shows nor stores them.

import {
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

export async function writeProfile(db: Firestore, incidentId: string, p: FamilyProfile): Promise<void> {
  const { shared, command } = profileDocs(p);
  await Promise.all([
    setDoc(doc(db, "incidents", incidentId, "profile", "shared"), shared),
    setDoc(doc(db, "incidents", incidentId, "profile", "command"), command),
  ]);
}

export function subscribeProfile(
  db: Firestore,
  incidentId: string,
  cb: (docs: { shared: SharedProfile | undefined; command: CommandProfile | undefined }) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  let shared: SharedProfile | undefined;
  let command: CommandProfile | undefined;
  const a = onSnapshot(doc(db, "incidents", incidentId, "profile", "shared"), (s) => { shared = s.data() as SharedProfile | undefined; cb({ shared, command }); }, onError);
  const b = onSnapshot(doc(db, "incidents", incidentId, "profile", "command"), (s) => { command = s.data() as CommandProfile | undefined; cb({ shared, command }); }, onError);
  return () => { a(); b(); };
}
