import { expect, it } from "vitest";
import { printableApproachLines, printablePersonLines, type SharedProfile } from "../hostApp";

const stop = "If they may not come when called, stop calling their name.";
const names = "Answers to Roberta (also Bea, Mom, Miss Bea)";

function shared(over: Partial<SharedProfile> = {}): SharedProfile {
  return { answersTo: "Roberta", nickname: "Bea", otherNames: ["Bea", "Mom", "Miss Bea"], approachNoteIds: [], ...over } as unknown as SharedProfile;
}

it("the stop-calling note is printable search-team guidance", () => {
  expect(printableApproachLines(["stop_calling_name"])).toEqual([stop]);
});

it("puts the names line, exactly as the approach card shows it, directly above the stop-calling note", () => {
  const [mayNot, calm] = [printableApproachLines(["may_not_respond"])[0]!, printableApproachLines(["approach_calm"])[0]!];
  const lines = printablePersonLines(shared({ approachNoteIds: ["may_not_respond", "approach_calm", "stop_calling_name", "seizures"] }));
  expect(lines).toEqual([mayNot, calm, names, stop]);
});

it("puts the names line first when the stop-calling note is not shown", () => {
  const calm = printableApproachLines(["approach_calm"])[0]!;
  expect(printablePersonLines(shared({ approachNoteIds: ["approach_calm"] }))).toEqual([names, calm]);
});

it("prints no names line when no name was given, and nothing without a profile", () => {
  const calm = printableApproachLines(["approach_calm"])[0]!;
  expect(printablePersonLines(shared({ answersTo: "", nickname: "", otherNames: [], approachNoteIds: ["approach_calm"] }))).toEqual([calm]);
  expect(printablePersonLines(null)).toEqual([]);
});

it("never prints a health or safety note, whatever the profile lists", () => {
  const lines = printablePersonLines(shared({ approachNoteIds: ["seizures", "medication_alert", "fall_risk", "may_strike_out"] }));
  expect(lines).toEqual([names]);
});
