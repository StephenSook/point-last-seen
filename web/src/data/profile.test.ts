import { describe, expect, it } from "vitest";
import notesFile from "../../../shared/constants/approach-notes.json";
import { answersToLine, APPROACH_FOOTER, approachLines, commandWarnings, emptyProfile, mergeProfileSave, profileDocs, profileFromDocs, profilePatch, sharedFromDoc } from "./profile";

const full = {
  ...emptyProfile(),
  answersTo: "Mae",
  primaryLanguage: "Spanish",
  appearance: "Short, grey hair in a bun",
  clothingLastWorn: "Blue coat",
  dementiaType: "lewy_body" as const,
  shareDementiaType: true,
  bestApproach: "Sing with her.",
  triggersToAvoid: "Loud voices.",
  uniqueDescription: "Hums while walking.",
  photoTakenOn: "2026-11-01",
  medications: "never stored",
  specialConcern: "never stored",
  birthdate: "1940-01-01",
  previousAddresses: [{ label: "Old house on Elm", position: null }],
  nearbyWater: "creek behind the house",
  flags: { ...emptyProfile().flags, likelyToHide: true, afraidOfUniforms: true, hallucinationsOrDelusions: true },
};

describe("profileDocs", () => {
  it("splits into the shared and command documents with no key in both and no family-only field", () => {
    const { shared, command } = profileDocs(full);
    expect(Object.keys(shared)).toHaveLength(20);
    expect(Object.keys(command).sort()).toEqual(["nearbyWater", "pastWandering", "placesFrequented", "previousAddresses", "vehicle"]);
    expect(Object.keys(shared).filter((k) => k in command)).toEqual([]);
    const both = JSON.stringify({ shared, command });
    for (const k of ["medications", "specialConcern", "birthdate", "never stored", "profileUpdatedOn", "shareDementiaType"]) expect(both).not.toContain(k);
  });

  it("shares the dementia type only with the family's consent", () => {
    expect(profileDocs({ ...full, shareDementiaType: false }).shared.dementiaType).toBeNull();
    expect(profileDocs(full).shared.dementiaType).toBe("lewy_body");
  });
});

describe("profileFromDocs", () => {
  it("reads both documents back into the form's profile", () => {
    const { shared, command } = profileDocs(full);
    const back = profileFromDocs(shared, command);
    expect(back.answersTo).toBe("Mae");
    expect(back.flags.likelyToHide).toBe(true);
    expect(back.previousAddresses).toEqual(full.previousAddresses);
    expect(back.shareDementiaType).toBe(true);
    expect(back.medications).toBe("");
  });

  it("starts from an empty profile when nothing is stored, with mayNotRespond on", () => {
    const p = profileFromDocs(undefined, undefined);
    expect(p).toEqual(emptyProfile());
    expect(p.flags.mayNotRespond).toBe(true);
  });
});

describe("approachLines", () => {
  it("default profile shows may_not_respond, approach_calm and stop_calling_name first, in the notes' own words", () => {
    const { first } = approachLines(profileDocs(emptyProfile()).shared);
    expect(first.map((l) => l.id)).toEqual(["may_not_respond", "approach_calm", "stop_calling_name"]);
    expect(first[0]!.text).toBe(notesFile.notes.may_not_respond.text);
    expect(first[2]!.text).toBe("If they may not come when called, stop calling their name.");
  });

  it("drops both name-calling notes when the family says they answer when called", () => {
    const p = emptyProfile();
    const lines = approachLines(profileDocs({ ...p, flags: { ...p.flags, mayNotRespond: false } }).shared);
    const ids = [...lines.first, ...lines.more].map((l) => l.id);
    expect(ids).not.toContain("may_not_respond");
    expect(ids).not.toContain("stop_calling_name");
  });

  it("fills the family's words and the language into their templates", () => {
    const lines = approachLines(profileDocs(full).shared);
    const all = [...lines.first, ...lines.more];
    expect(all.find((l) => l.id === "language")!.text).toBe("Primary language: Spanish.");
    expect(all.find((l) => l.id === "best_approach")!.text).toBe("Sing with her.");
    expect(all.find((l) => l.id === "best_approach")!.sourceRole).toBe("family");
  });

  it("shows at most seven notes first and the rest under More", () => {
    const lines = approachLines(profileDocs(full).shared);
    expect(lines.first).toHaveLength(7);
    expect(lines.more.length).toBeGreaterThan(0);
  });

  it("skips an id it has no copy for", () => {
    const shared = { ...profileDocs(emptyProfile()).shared, approachNoteIds: ["nope", "approach_calm"] };
    expect(approachLines(shared).first.map((l) => l.id)).toEqual(["approach_calm"]);
  });

  it("carries the footer from the notes file", () => {
    expect(APPROACH_FOOTER).toBe("General guidance from dementia care practitioners and search teams. Not medical advice.");
  });
});

describe("commandWarnings", () => {
  const now = Date.UTC(2026, 10, 22);
  it("warns when the photo is older than 60 days", () => {
    expect(commandWarnings({ ...full, photoTakenOn: "2026-09-01" }, now)).toEqual(["photo_old"]);
    expect(commandWarnings({ ...full, photoTakenOn: "2026-11-10" }, now)).toEqual([]);
  });

  it("never shows the profile-update warning at command, which cannot see that date", () => {
    expect(commandWarnings({ ...full, profileUpdatedOn: null }, now)).not.toContain("profile_stale");
  });
});

describe("other names", () => {
  const five = ["Bobbie", "Mom", "Roberta", "Miss Bea", "Bea"];

  it("a clothing edit at command keeps all five names, with the nickname mirroring the first", () => {
    const stored = { ...profileDocs(emptyProfile()).shared, otherNames: five, nickname: "Bobbie" };
    const p = profileFromDocs(sharedFromDoc(stored), undefined);
    const saved = profileDocs({ ...p, clothingLastWorn: "Green raincoat" }).shared;
    expect(saved.otherNames).toEqual(five);
    expect(saved.nickname).toBe("Bobbie");
    expect(saved.clothingLastWorn).toBe("Green raincoat");
  });

  it("reads only string names, and adds no list when none was stored", () => {
    expect(sharedFromDoc({ otherNames: ["Bea", 7, null, "Mom"] }).otherNames).toEqual(["Bea", "Mom"]);
    expect("otherNames" in sharedFromDoc({ nickname: "Bea" })).toBe(false);
  });
});

describe("profilePatch", () => {
  it("a clothing edit writes the clothing only, so names the family adds meanwhile are kept", () => {
    const opened = profileFromDocs(sharedFromDoc({ ...profileDocs(emptyProfile()).shared, otherNames: ["Bea", "Mom"], nickname: "Bea" }), undefined);
    const patch = profilePatch(opened, { ...opened, clothingLastWorn: "Green raincoat" });
    expect(patch.shared).toEqual({ clothingLastWorn: "Green raincoat" });
    expect(patch.command).toEqual({});
  });
  it("a flag change writes the flag map and the approach notes it changes, nothing else", () => {
    const opened = emptyProfile();
    const patch = profilePatch(opened, { ...opened, flags: { ...opened.flags, likelyToHide: true } });
    expect(Object.keys(patch.shared).sort()).toEqual(["approachNoteIds", "flags"]);
  });
  it("a command-only edit touches only the command document", () => {
    const opened = emptyProfile();
    const patch = profilePatch(opened, { ...opened, nearbyWater: "Clear Creek" });
    expect(patch.shared).toEqual({});
    expect(patch.command).toEqual({ nearbyWater: "Clear Creek" });
  });
});

describe("mergeProfileSave: what a command save writes over the documents as the server holds them now", () => {
  const emptyDocs = profileDocs(emptyProfile());
  const names = ["Bea", "Mom", "Roberta"];

  it("family created the shared profile after command opened the form: the names stay, the clothing is added", () => {
    const opened = emptyProfile();
    const family = { ...emptyDocs.shared, otherNames: names, nickname: "Bea" };
    const out = mergeProfileSave(opened, { ...opened, clothingLastWorn: "Green raincoat" }, { shared: family, command: null });
    expect(out.shared).toMatchObject({ otherNames: names, nickname: "Bea", clothingLastWorn: "Green raincoat" });
  });

  it("family changed the names after command opened the form: both edits are kept", () => {
    const opened = profileFromDocs(sharedFromDoc({ ...emptyDocs.shared, otherNames: ["Bea"], nickname: "Bea" }), undefined);
    const family = { ...emptyDocs.shared, otherNames: names, nickname: "Bea" };
    const out = mergeProfileSave(opened, { ...opened, clothingLastWorn: "Green raincoat" }, { shared: family, command: null });
    expect(out.shared).toMatchObject({ otherNames: names, clothingLastWorn: "Green raincoat" });
  });

  it("a legacy shared document with only a nickname is completed, so the save is a full valid document", () => {
    const opened = profileFromDocs(sharedFromDoc({ nickname: "Bea" }), undefined);
    const out = mergeProfileSave(opened, { ...opened, clothingLastWorn: "Green raincoat" }, { shared: { nickname: "Bea" }, command: null });
    expect(Object.keys(out.shared!).sort()).toEqual(Object.keys(emptyDocs.shared).sort());
    expect(out.shared).toMatchObject({ nickname: "Bea", clothingLastWorn: "Green raincoat" });
  });

  it("a family flag set meanwhile keeps the search guidance it adds", () => {
    const opened = emptyProfile();
    const family = profileDocs({ ...emptyProfile(), flags: { ...emptyProfile().flags, fallRisk: true } }).shared;
    const out = mergeProfileSave(opened, { ...opened, bestApproach: "Sing with her." }, { shared: family, command: null });
    expect((out.shared as { flags: { fallRisk: boolean } }).flags.fallRisk).toBe(true);
    expect((out.shared as { approachNoteIds: string[] }).approachNoteIds).toContain("fall_risk");
    expect(out.shared).toMatchObject({ bestApproach: "Sing with her." });
  });

  it("a nickname edit loses to a names list the family added meanwhile, and the other edits still land", () => {
    const opened = emptyProfile();
    const family = { ...emptyDocs.shared, otherNames: names, nickname: "Bea" };
    const out = mergeProfileSave(opened, { ...opened, nickname: "Bobbie", clothingLastWorn: "Green raincoat" }, { shared: family, command: null });
    expect(out.shared).toMatchObject({ nickname: "Bea", otherNames: names, clothingLastWorn: "Green raincoat" });
  });

  it("writes nothing when nothing changed", () => {
    const opened = profileFromDocs(emptyDocs.shared, emptyDocs.command);
    expect(mergeProfileSave(opened, opened, { shared: emptyDocs.shared, command: emptyDocs.command })).toEqual({ shared: null, command: null });
  });

  it("creates a document that is still absent on the server from the edited profile", () => {
    const opened = emptyProfile();
    const out = mergeProfileSave(opened, { ...opened, nearbyWater: "Clear Creek" }, { shared: null, command: null });
    expect(out.command).toMatchObject({ nearbyWater: "Clear Creek" });
  });
});

describe("answersToLine", () => {
  const base = profileDocs(emptyProfile()).shared;
  it("names every name they answer to: the main one, then the others", () => {
    expect(answersToLine({ ...base, answersTo: "Roberta", otherNames: ["Bea", "Mom", "Miss Bea"], nickname: "Bea" })).toBe("Answers to Roberta (also Bea, Mom, Miss Bea)");
  });
  it("does not repeat the main name, and falls back to the nickname without a list", () => {
    expect(answersToLine({ ...base, answersTo: "Bea", otherNames: ["Bea", "Mom"], nickname: "Bea" })).toBe("Answers to Bea (also Mom)");
    expect(answersToLine({ ...base, answersTo: "Roberta", nickname: "Bea" })).toBe("Answers to Roberta (also Bea)");
    expect(answersToLine({ ...base, answersTo: "Roberta", nickname: "" })).toBe("Answers to Roberta");
  });
  it("uses the names alone when no main name was given, and says nothing with none", () => {
    expect(answersToLine({ ...base, answersTo: "", otherNames: ["Bea", "Mom"], nickname: "Bea" })).toBe("Answers to Bea, Mom");
    expect(answersToLine({ ...base, answersTo: "", nickname: "" })).toBeNull();
  });
});

describe("the family's tracking aids", () => {
  const aids = { aids: ["project_lifesaver", "gps_tracker"], note: "Tracker is in her coat pocket" };
  it("are read from the stored document, and absent stays absent", () => {
    expect(sharedFromDoc({ ...profileDocs(emptyProfile()).shared, trackingAids: aids }).trackingAids).toEqual(aids);
    expect("trackingAids" in sharedFromDoc(profileDocs(emptyProfile()).shared)).toBe(false);
  });
  it("are removed when command sets them back to not known", () => {
    const opened = { ...emptyProfile(), trackingAids: { aids: ["gps_tracker" as const], note: "" } };
    const { trackingAids: _drop, ...edited } = opened;
    const stored = { ...profileDocs(opened).shared };
    const out = mergeProfileSave(opened, edited, { shared: stored, command: null });
    expect(out.shared).not.toBeNull();
    expect("trackingAids" in (out.shared as object)).toBe(false);
  });
  it("survive a command save of another shared field, since the document is written whole", () => {
    const opened = emptyProfile();
    const edited = { ...opened, gender: "female" };
    const stored = { ...profileDocs(opened).shared, trackingAids: aids };
    const out = mergeProfileSave(opened, edited, { shared: stored, command: null });
    expect(out.shared).toMatchObject({ gender: "female", trackingAids: aids });
  });
});
