// Tracking aids on the shared profile: the card's lines come from shared/constants/tracking-aids.json, so every app
// shows the same words. For the cards only; never part of what a model is sent.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import aidsFile from "../../constants/tracking-aids.json";
import { profileForModel, profileForSearchers, trackingAidLines } from "../src/index";
import type { FamilyProfile } from "../src/index";

const line = (id: string) => aidsFile.aids.find(a => a.id === id)!.line;

describe("trackingAidLines", () => {
  it("gives nothing when the family has not said (the field is absent)", () => {
    expect(trackingAidLines({})).toEqual([]);
  });
  it("says the family named none when the list and the note are empty", () => {
    expect(trackingAidLines({ trackingAids: { aids: [], note: "" } })).toEqual(["No tracker or medical ID, as the family said."]);
    expect(trackingAidLines({ trackingAids: { aids: [], note: "   " } })).toEqual(["No tracker or medical ID, as the family said."]);
  });
  it("gives one line per aid in the constants' order, then the note, and skips a choice it does not know", () => {
    const lines = trackingAidLines({ trackingAids: { aids: ["phone_location", "airtag" as never, "project_lifesaver"], note: " Tracker in his coat pocket " } });
    expect(lines).toEqual([line("project_lifesaver"), line("phone_location"), "Tracker in his coat pocket"]);
    expect(trackingAidLines({ trackingAids: { aids: [], note: "County gave her a wrist unit" } })).toEqual(["County gave her a wrist unit"]);
  });
});

describe("tracking aids and the profile documents", () => {
  const base = { answersTo: "Nana", nickname: "", ageYears: 81, gender: "woman", appearance: "short", heightFt: 5, heightIn: 2,
    weightLb: 120, hair: "white", eyeColor: "brown", primaryLanguage: "", clothingLastWorn: "red coat", mobilityAids: [],
    dementiaType: "unknown", shareDementiaType: true, flags: {}, triggersToAvoid: "", bestApproach: "", uniqueDescription: "",
    photoTakenOn: null, profileUpdatedOn: null, birthdate: null, medications: "", howMedicationAffectsActions: "",
    specialConcern: "", previousAddresses: [], placesFrequented: [], pastWandering: [], nearbyWater: "", vehicle: null,
    trackingAids: { aids: ["medicalert_id"], note: "" } } as unknown as FamilyProfile;
  it("go into profile/shared when the family gave them, and stay out when it did not", () => {
    expect(profileForSearchers(base).trackingAids).toEqual({ aids: ["medicalert_id"], note: "" });
    const { trackingAids: _t, ...without } = base;
    expect("trackingAids" in profileForSearchers(without as FamilyProfile)).toBe(false);
  });
  it("are never part of what a model is sent", () => {
    expect(JSON.stringify(profileForModel(base))).not.toMatch(/trackingAids|medicalert/);
  });
  it("have the same choices in the constants as in the schema", () => {
    const schema = JSON.parse(readFileSync(new URL("../../schemas/subject-profile.schema.json", import.meta.url), "utf8"));
    const choices = schema.$defs.SharedProfile.properties.trackingAids.properties.aids.items.enum;
    expect(aidsFile.aids.map(a => a.id)).toEqual(choices);
    expect(schema.$defs.SharedProfile.properties.trackingAids.properties.note.maxLength).toBe(aidsFile.noteMaxChars);
  });
});
