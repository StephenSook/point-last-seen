import notesFile from "../../constants/approach-notes.json";
import { eventId } from "./ids";
import type { CommandProfile, EventDoc, Place, ProfileFlags, SharedProfile } from "./types";

/**
 * The family's full profile as it lives on the family phone (spec section 13.2). Only the shared fields
 * reach profile/shared, only the command fields reach profile/command, and the family-only fields
 * (birthdate, medications, how medication affects actions, special concern, profileUpdatedOn) never leave it.
 */
export interface FamilyProfile extends Omit<SharedProfile, "approachNoteIds">, CommandProfile {
  /** The family's consent switch for sharing dementiaType with searchers. */
  shareDementiaType: boolean;
  birthdate: string | null;
  profileUpdatedOn: string | null;
  medications: string;
  howMedicationAffectsActions: string;
  specialConcern: string;
}

/** The only profile fields any model prompt or tool output may carry: appearance and clothing. */
export interface ModelProfile {
  appearance: string;
  clothingLastWorn: string;
  hair: string;
  heightFt: number | null;
  heightIn: number | null;
  mobilityAids: SharedProfile["mobilityAids"];
}

export type ProfileWarning = "photo_old" | "profile_stale";

const SHARED_KEYS = [
  "answersTo", "nickname", "ageYears", "gender", "appearance", "heightFt", "heightIn", "weightLb", "hair", "eyeColor",
  "primaryLanguage", "clothingLastWorn", "mobilityAids", "dementiaType", "flags", "triggersToAvoid", "bestApproach",
  "uniqueDescription", "photoTakenOn",
] as const;
const PHOTO_OLD_DAYS = 60;
const PROFILE_STALE_DAYS = 183;
const DAY_MS = 86_400_000;

const ORDER: string[] = notesFile.order;
const has = (s: string) => s.trim().length > 0;

/** Whether each note applies (the "shownWhen" column of approach-notes.json). */
function applies(id: string, p: FamilyProfile): boolean {
  const f: ProfileFlags = p.flags;
  switch (id) {
    case "may_not_respond": return f.mayNotRespond !== false;
    case "approach_calm": return true;
    case "likely_to_hide": return f.likelyToHide;
    case "afraid_of_uniforms": return f.afraidOfUniforms;
    case "validate_feelings": return f.hallucinationsOrDelusions || (p.shareDementiaType && p.dementiaType === "lewy_body");
    case "looking_for_home": return f.lookingForHome;
    case "gait_unsteady": return f.gaitUnsteady;
    case "freezing": return f.freezing;
    case "fall_risk": return f.fallRisk;
    case "soft_voice": return f.softVoice || f.slowToRespond;
    case "fluctuates": return f.fluctuates;
    case "sensitive_to_touch": return f.sensitiveToTouch;
    case "sensitive_to_light": return f.sensitiveToLight;
    case "may_strike_out": return f.likelyToFight;
    case "seizures": return f.seizures;
    case "medication_alert": return f.medicationSensitivity || f.carriesMedicalAlertCard;
    case "medication_timing": return f.medicationTimingMatters;
    case "language": return has(p.primaryLanguage);
    case "triggers": return has(p.triggersToAvoid);
    case "best_approach": return has(p.bestApproach);
    case "unique": return has(p.uniqueDescription);
    default: return false;
  }
}

/** Approach note ids for the card, in the constants' order (may_not_respond and approach_calm first). Code, no model. */
export function approachNoteIds(profile: FamilyProfile): string[] {
  return ORDER.filter(id => applies(id, profile));
}

/** The names to call the person by: the other-names list when present, else the nickname. Readers use this. */
export function namesToCall(p: Pick<SharedProfile, "nickname" | "otherNames">): string[] {
  if (p.otherNames !== undefined) return p.otherNames.filter(has);
  return has(p.nickname) ? [p.nickname] : [];
}

/**
 * The profile/shared document: the 20 shared fields, plus otherNames when the family has the list (nickname then
 * mirrors its first entry); dementiaType only with the family's consent (else null).
 */
export function profileForSearchers(profile: FamilyProfile): SharedProfile {
  const out: Record<string, unknown> = {};
  for (const k of SHARED_KEYS) out[k] = profile[k];
  if (profile.otherNames !== undefined) {
    out.otherNames = [...profile.otherNames];
    out.nickname = profile.otherNames[0] ?? "";
  }
  out.dementiaType = profile.shareDementiaType ? profile.dementiaType : null;
  out.approachNoteIds = approachNoteIds(profile);
  return out as unknown as SharedProfile;
}

/** The profile/command document: history, places, water and vehicle. Command and family only; never packed. */
export function profileForCommand(profile: FamilyProfile): CommandProfile {
  const { previousAddresses, placesFrequented, pastWandering, nearbyWater, vehicle } = profile;
  return { previousAddresses, placesFrequented, pastWandering, nearbyWater, vehicle };
}

/** Appearance and clothing only (spec section 13.2): nothing else in the profile reaches any model. */
export function profileForModel(profile: FamilyProfile): ModelProfile {
  const { appearance, clothingLastWorn, hair, heightFt, heightIn, mobilityAids } = profile;
  return { appearance, clothingLastWorn, hair, heightFt, heightIn, mobilityAids };
}

function daysSince(date: string | null, todayMs: number): number | null {
  if (date === null) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor((todayMs - t) / DAY_MS) : null;
}

/** "photo_old" past 60 days, "profile_stale" past 183 days; a missing or unreadable date also warns. */
export function profileWarnings(profile: FamilyProfile, todayMs: number): ProfileWarning[] {
  const out: ProfileWarning[] = [];
  const photo = daysSince(profile.photoTakenOn, todayMs);
  if (photo === null || photo > PHOTO_OLD_DAYS) out.push("photo_old");
  const updated = daysSince(profile.profileUpdatedOn, todayMs);
  if (updated === null || updated > PROFILE_STALE_DAYS) out.push("profile_stale");
  return out;
}

/** Detection assumptions (spec section 10.4): sound counts only if the family says they answer; hide or
 * uniform fears ask for a low, partly hidden target at the range step. */
export function detectionProfile(profile: FamilyProfile): { soundCounts: boolean; hiddenTarget: boolean } {
  return { soundCounts: profile.flags.mayNotRespond === false, hiddenTarget: profile.flags.likelyToHide || profile.flags.afraidOfUniforms };
}

export interface PlaceToCheckContext {
  incidentId: string;
  /** The command user's auth uid, which is also the event's deviceId (rules bind them). */
  uid: string;
  seq: number;
  clientTimeMs: number;
  priorVersion: number;
}

/**
 * A destination event for ONE place a person at command chose to share: its label and position only, never
 * the list it came from. Effect "none" / "informational" (a place to check, not a likelihood). The writer
 * replaces serverTime with the Firestore server timestamp.
 */
export function placeToCheck(entry: Place, ctx: PlaceToCheckContext): EventDoc {
  return {
    eventId: eventId(ctx.incidentId, ctx.uid, ctx.seq), schemaVersion: 1, incidentId: ctx.incidentId, teamId: null,
    deviceId: ctx.uid, seq: ctx.seq, authorUid: ctx.uid, role: "command", type: "destination", reporter: "family",
    clientTimeMs: ctx.clientTimeMs, serverTime: null, observedAtMs: null,
    position: entry.position ? { lat: entry.position.lat, lon: entry.position.lon, accuracyM: null } : null,
    positionSource: entry.position ? "manual" : "none", rawText: entry.label, inputMethod: "typed",
    isTrainingInject: false, reading: null, effect: { kind: "none", why: "informational" }, route: null,
    targetEventId: null, decision: null, planVersion: null, priorVersion: ctx.priorVersion,
  };
}
