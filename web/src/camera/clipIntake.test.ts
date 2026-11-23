import { describe, expect, it } from "vitest";
import { clipFacts, clipOutcomeMessage } from "./ClipIntake";

describe("clipFacts", () => {
  it("states length and size in short units", () => {
    expect(clipFacts(4448, 6)).toBe("6 s, 4 KB");
    expect(clipFacts(13_400_000, 41)).toBe("41 s, 13.4 MB");
    expect(clipFacts(13_400_000, null)).toBe("13.4 MB");
  });
});

describe("clipOutcomeMessage", () => {
  it("says what happened and that nothing changed when the clip could not be read", () => {
    expect(clipOutcomeMessage({ kind: "could-not-read" })).toBe("Couldn't read this clip. Nothing changed.");
    expect(clipOutcomeMessage({ kind: "failed" })).toBe("The clip was not read. Try again.");
    expect(clipOutcomeMessage({ kind: "refused", message: "Clip reading is paused right now." })).toBe("Clip reading is paused right now.");
  });

  it("names App Check when it refused the cloud step, where trying again would not help", () => {
    const appCheck = "Cloud step refused by App Check. Try a normal browser window.";
    expect(clipOutcomeMessage({ kind: "failed", recorded: true, status: 403 })).toBe(appCheck);
    expect(clipOutcomeMessage({ kind: "failed", recorded: true, status: 401 })).toBe(appCheck);
  });

  it("says the cloud is busy and to wait a minute when the quota ran out", () => {
    expect(clipOutcomeMessage({ kind: "failed", recorded: true, status: 429 })).toBe("The cloud is busy right now. Try again in a minute.");
  });

  it("keeps the try-again line for any other status", () => {
    expect(clipOutcomeMessage({ kind: "failed", recorded: true, status: 500 })).toBe("The clip was not read. Try again.");
  });
});
