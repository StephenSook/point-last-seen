import { describe, expect, it } from "vitest";
import notesFile from "../../constants/approach-notes.json";
import {
  approachNoteIds, detectionProfile, namesToCall, placeToCheck, profileForCommand, profileForModel, profileForSearchers, profileWarnings,
} from "../src/index";
import type { FamilyProfile, ProfileFlags } from "../src/index";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 22);
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString().slice(0, 10);
const noFlags: ProfileFlags = {
  mayNotRespond: true, likelyToHide: false, afraidOfUniforms: false, sensitiveToTouch: false, sensitiveToLight: false,
  likelyToFight: false, seizures: false, hallucinationsOrDelusions: false, lookingForHome: false, gaitUnsteady: false,
  freezing: false, fallRisk: false, softVoice: false, slowToRespond: false, fluctuates: false, medicationSensitivity: false,
  carriesMedicalAlertCard: false, medicationTimingMatters: false,
};
const base: FamilyProfile = {
  answersTo: "Nana", nickname: "", ageYears: 81, gender: "woman", appearance: "short, white hair in a bun",
  heightFt: 5, heightIn: 2, weightLb: 120, hair: "white", eyeColor: "brown", primaryLanguage: "", clothingLastWorn: "red coat",
  mobilityAids: [], dementiaType: "unknown", shareDementiaType: true, flags: noFlags, triggersToAvoid: "", bestApproach: "",
  uniqueDescription: "", photoTakenOn: daysAgo(5), profileUpdatedOn: daysAgo(10), birthdate: "1945-03-01",
  medications: "", howMedicationAffectsActions: "", specialConcern: "",
  previousAddresses: [], placesFrequented: [], pastWandering: [], nearbyWater: "", vehicle: null,
};
const withFlags = (p: FamilyProfile, f: Partial<ProfileFlags>): FamilyProfile => ({ ...p, flags: { ...p.flags, ...f } });
const full: FamilyProfile = {
  ...base, medications: "donepezil", howMedicationAffectsActions: "drowsy after lunch", specialConcern: "fears dogs",
  previousAddresses: [{ label: "Old house on Elm", position: { lat: 33.71, lon: -84.31 } }, { label: "Farm in Dahlonega", position: null }],
  placesFrequented: [{ label: "Church", position: { lat: 33.72, lon: -84.32 } }], pastWandering: [{ foundWhere: "creek", position: null }],
  nearbyWater: "creek behind the house", vehicle: { involved: false, description: "" }, primaryLanguage: "Spanish",
  bestApproach: "Sing with her.", triggersToAvoid: "Loud voices.", uniqueDescription: "Hums while walking.",
};
const ctx = { incidentId: "drill-dev-1", uid: "command-uid", seq: 1795860000000, clientTimeMs: 1795860000000, priorVersion: 1 };
const notes = notesFile.notes as Record<string, { text: string; shownWhen: string; sourceRole: string }>;
const ALL_NOTE_IDS = notesFile.order;

describe("approach notes and profile split (spec section 13)", () => {
  it("default profile shows may_not_respond and approach_calm first", () => {
    expect(approachNoteIds(base).slice(0, 2)).toEqual(["may_not_respond", "approach_calm"]);
  });
  it("stop_calling_name follows the first two whenever may_not_respond shows (field expert)", () => {
    expect(approachNoteIds(base).slice(0, 3)).toEqual(["may_not_respond", "approach_calm", "stop_calling_name"]);
    const answers = withFlags(base, { mayNotRespond: false });
    expect(approachNoteIds(answers)).not.toContain("may_not_respond");
    expect(approachNoteIds(answers)).not.toContain("stop_calling_name");
    expect(notes.stop_calling_name).toEqual({ text: "If they may not come when called, stop calling their name.",
      shownWhen: notesFile.notes.may_not_respond.shownWhen, sourceRole: "search_team" });
  });
  it("hide and uniform flags add notes and set the hidden target", () => {
    const p = withFlags(base, { likelyToHide: true, afraidOfUniforms: true });
    expect(approachNoteIds(p)).toEqual(expect.arrayContaining(["likely_to_hide", "afraid_of_uniforms"]));
    expect(detectionProfile(p)).toEqual({ soundCounts: false, hiddenTarget: true });
    expect(detectionProfile(base)).toEqual({ soundCounts: false, hiddenTarget: false });
  });
  it("Lewy body or hallucinations adds validate_feelings; an unshared diagnosis does not", () => {
    expect(approachNoteIds({ ...base, dementiaType: "lewy_body" })).toContain("validate_feelings");
    expect(approachNoteIds(withFlags(base, { hallucinationsOrDelusions: true }))).toContain("validate_feelings");
    expect(approachNoteIds({ ...base, dementiaType: "lewy_body", shareDementiaType: false })).not.toContain("validate_feelings");
  });
  it("notes follow the constants' order, and family text and language add their own notes", () => {
    const ids = approachNoteIds(withFlags(full, { fallRisk: true, softVoice: true, seizures: true }));
    const order = ALL_NOTE_IDS;
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(ids).toEqual(expect.arrayContaining(["fall_risk", "soft_voice", "seizures", "language", "triggers", "best_approach", "unique"]));
  });
  it("profileForModel carries appearance and clothing only", () => {
    expect(Object.keys(profileForModel(full)).sort()).toEqual(["appearance", "clothingLastWorn", "hair", "heightFt", "heightIn", "mobilityAids"]);
  });
  it("shared and command profiles share no key, and neither carries medications or birthdate", () => {
    const a = Object.keys(profileForSearchers(full)), b = Object.keys(profileForCommand(full));
    expect(a.filter(k => b.includes(k))).toEqual([]);
    for (const k of ["medications", "howMedicationAffectsActions", "birthdate", "specialConcern", "shareDementiaType", "profileUpdatedOn"]) {
      expect(JSON.stringify([profileForSearchers(full), profileForCommand(full)])).not.toContain(k);
    }
    expect(Object.keys(profileForSearchers(full)).length).toBe(20);
    expect(Object.keys(profileForCommand(full)).sort()).toEqual(["nearbyWater", "pastWandering", "placesFrequented", "previousAddresses", "vehicle"]);
  });
  it("dementiaType is shared only with the consent switch (null otherwise, as the schema requires)", () => {
    expect(profileForSearchers({ ...full, shareDementiaType: false }).dementiaType).toBeNull();
    expect(profileForSearchers({ ...full, dementiaType: "vascular" }).dementiaType).toBe("vascular");
  });
  it("other names she may answer to: shared as listed, with nickname mirroring the first (field expert)", () => {
    const shared = profileForSearchers({ ...full, nickname: "old", otherNames: ["Mom", "Margaret", "Peggy"] });
    expect(shared.otherNames).toEqual(["Mom", "Margaret", "Peggy"]);
    expect(shared.nickname).toBe("Mom");
    expect(Object.keys(shared).length).toBe(21);
    expect(profileForSearchers({ ...full, nickname: "old", otherNames: [] }).nickname).toBe("");
    // An older profile with no list keeps its nickname and adds no key (Firestore refuses an undefined field).
    const old = profileForSearchers({ ...full, nickname: "Peggy" });
    expect(old.nickname).toBe("Peggy");
    expect("otherNames" in old).toBe(false);
  });
  it("readers call the person by the list, falling back to the nickname", () => {
    expect(namesToCall({ nickname: "Mom", otherNames: ["Mom", "Peggy"] })).toEqual(["Mom", "Peggy"]);
    expect(namesToCall({ nickname: "Peggy" })).toEqual(["Peggy"]);
    expect(namesToCall({ nickname: "", otherNames: [] })).toEqual([]);
    expect(namesToCall({ nickname: "  " })).toEqual([]);
  });
  it("profileForSearchers carries the approach note ids", () => {
    expect(profileForSearchers(full).approachNoteIds).toEqual(approachNoteIds(full));
  });
  it("warns after 60 and 183 days, and when a date is missing", () => {
    expect(profileWarnings({ ...base, photoTakenOn: daysAgo(61), profileUpdatedOn: daysAgo(10) }, now)).toEqual(["photo_old"]);
    expect(profileWarnings({ ...base, photoTakenOn: daysAgo(5), profileUpdatedOn: daysAgo(184) }, now)).toEqual(["profile_stale"]);
    expect(profileWarnings({ ...base, photoTakenOn: daysAgo(60), profileUpdatedOn: daysAgo(183) }, now)).toEqual([]);
    expect(profileWarnings({ ...base, photoTakenOn: null, profileUpdatedOn: null }, now)).toEqual(["photo_old", "profile_stale"]);
  });
  it("every note has copy and a source role, and none gives medical advice", () => {
    for (const id of ALL_NOTE_IDS) {
      expect(notes[id]!.text.length).toBeGreaterThan(0);
      expect(["practitioner", "search_team", "family", "ours"]).toContain(notes[id]!.sourceRole);
    }
    expect(Object.keys(notes).sort()).toEqual([...ALL_NOTE_IDS].sort());
    expect(JSON.stringify(notesFile)).not.toMatch(/police use|predict|diagnos|should take|dose of/i);
  });
  it("a place to check carries a label and a position, not the list it came from", () => {
    const e = placeToCheck(full.previousAddresses[0]!, ctx);
    expect(e.type).toBe("destination");
    expect(e.effect).toEqual({ kind: "none", why: "informational" });
    expect(e.rawText).toBe("Old house on Elm");
    expect(e.position).toEqual({ lat: 33.71, lon: -84.31, accuracyM: null });
    expect(JSON.stringify(e)).not.toContain(full.previousAddresses[1]!.label);
    expect(e.deviceId).toBe(ctx.uid);
    expect(e.eventId).toMatch(/^[0-9a-f]{32}$/);
  });
});
