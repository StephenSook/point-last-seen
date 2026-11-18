import { describe, expect, it } from "vitest";
import schema from "../../schemas/camera-sighting.schema.json";
import * as engine from "../src/index";
import type { CameraSightingInput, ClipConsent } from "../src/index";

const { MAX_CLIP_BYTES, base64Size, bearingFromExit, checkSighting, consentComplete, lastSeenMs, sizeProblem } = engine;

const sha = "a".repeat(64);
const mark = { byUid: "u1", atMs: 5 };
const full: ClipConsent = {
  clipSha256: sha,
  personInClip: mark,
  footageOwner: mark,
  cloudProcessing: mark,
  publicUse: null,
};

const sighting: CameraSightingInput = {
  personVisible: true,
  firstSeen: "00:03",
  lastSeen: "00:12",
  entryEdge: "right",
  exitEdge: "left",
  topColor: "blue",
  bottomColor: "black",
  topType: "coat",
  footwear: "sneakers",
  headwear: "none",
  carriedItems: ["bag"],
  keyFrame: { time: "00:05", box2d: [100, 200, 900, 500] },
  lighting: "day",
  legibility: "clear",
  evidence: "a person in a blue coat walks out of the left edge",
};

describe("clip rules", () => {
  // ClipRulesTest.theCapIsFourteenMillionBytes
  it("uses the Android byte limit", () => {
    expect(MAX_CLIP_BYTES).toBe(14_000_000);
  });

  // ClipRulesTest.theEncodedSizeOfTheLargestClipStaysUnder20MB
  it("fits the largest clip under the encoded request limit", () => {
    expect(Math.ceil(MAX_CLIP_BYTES / 3) * 4).toBeLessThan(20_000_000);
    expect(base64Size(MAX_CLIP_BYTES)).toBe(18_666_668);
  });

  it("rounds partial base64 groups up", () => {
    expect([0, 1, 2, 3, 4].map(base64Size)).toEqual([0, 4, 4, 4, 8]);
  });

  // ClipRulesTest.aClipOverTheCapIsRefusedWithTheNumber
  it("returns the Android messages for clips outside the size limits", () => {
    expect(sizeProblem(14_000_001)).toBe("This clip is larger than 14,000,000 bytes. Trim it and try again.");
    expect(sizeProblem(14_000_000)).toBeNull();
    expect(sizeProblem(0)).toBe("This clip is empty.");
    expect(sizeProblem(-1)).toBe("This clip is empty.");
  });

  // ClipRulesTest.threeConsentsAreRequiredAndPublicUseIsNot
  it("requires the person, owner and cloud marks and accepts no public mark", () => {
    expect(consentComplete(full, sha)).toBe(true);
    expect(consentComplete({ ...full, cloudProcessing: null }, sha)).toBe(false);
    expect(consentComplete({ ...full, personInClip: null }, sha)).toBe(false);
    expect(consentComplete({ ...full, footageOwner: null }, sha)).toBe(false);
  });

  // ClipRulesTest.consentGivenForOneClipDoesNotCoverAnother
  it("requires the same clip hash", () => {
    expect(consentComplete(full, "b".repeat(64))).toBe(false);
  });
});

describe("exit bearing", () => {
  // BearingTest.bearingMatchesTheSharedCases
  it("normalizes side exits and returns null for unknown, top or missing facing", () => {
    expect(bearingFromExit(0, "left")).toBe(270);
    expect(bearingFromExit(350, "right")).toBe(80);
    expect(bearingFromExit(90, "unknown")).toBeNull();
    expect(bearingFromExit(90, "top")).toBeNull();
    expect(bearingFromExit(null, "left")).toBeNull();
  });

  // BearingTest.towardAndAwayFollowTheTable
  it("maps toward and away and gives no bearing for bottom", () => {
    expect(bearingFromExit(90, "toward_camera")).toBe(270);
    expect(bearingFromExit(90, "away_from_camera")).toBe(90);
    expect(bearingFromExit(90, "bottom")).toBeNull();
  });

  it("normalizes bearings outside a full turn", () => {
    expect(bearingFromExit(-450, "away_from_camera")).toBe(270);
    expect(bearingFromExit(720, "away_from_camera")).toBe(0);
  });
});

describe("camera sighting", () => {
  // SightingCheckTest.nightInfraredSuppressesColors
  it("suppresses both colors for night infrared", () => {
    const result = checkSighting({ ...sighting, lighting: "night_ir", topColor: "blue" }, 30);
    expect(result.cleaned.topColor).toBe("unknown");
    expect(result.cleaned.bottomColor).toBe("unknown");
    expect(result.colorSuppressed).toBe(true);
    expect(result.ok).toBe(true);
  });

  // SightingCheckTest.impossibleTimesFail
  it("rejects first seen after last seen", () => {
    const result = checkSighting({ ...sighting, firstSeen: "00:20", lastSeen: "00:10" }, 30);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["first_after_last"]);
  });

  // SightingCheckTest.lastSeenAfterTheClipEndsFails
  it("rejects last seen after the clip ends", () => {
    const result = checkSighting({ ...sighting, lastSeen: "01:10" }, 30);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["last_after_clip_end"]);
  });

  // SightingCheckTest.boxOutsideTheFrameFails
  it("rejects out-of-bounds, inverted and short boxes", () => {
    for (const box2d of [[0, 0, 1200, 500], [800, 0, 100, 500], [1, 2, 3]]) {
      const result = checkSighting({ ...sighting, keyFrame: { time: "00:05", box2d } }, 30);
      expect(result.ok).toBe(false);
      expect(result.reasons).toEqual(["box"]);
    }
  });

  // SightingCheckTest.keyFrameOutsideTheClipFails
  it("rejects a key frame after the clip ends", () => {
    const result = checkSighting({ ...sighting, keyFrame: { ...sighting.keyFrame, time: "00:40" } }, 30);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["key_frame_after_clip_end"]);
  });

  // SightingCheckTest.malformedTimesFail
  it("rejects malformed first and last seen times", () => {
    const badFirst = checkSighting({ ...sighting, firstSeen: "3s" }, 30);
    const badLast = checkSighting({ ...sighting, lastSeen: "00:75" }, 30);
    expect(badFirst.ok).toBe(false);
    expect(badFirst.reasons).toEqual(["first_seen_format"]);
    expect(badLast.ok).toBe(false);
    expect(badLast.reasons).toEqual(["last_seen_format"]);
  });

  // SightingCheckTest.noPersonFails
  it("rejects a sighting without a visible person", () => {
    const result = checkSighting({ ...sighting, personVisible: false }, 30);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["no_person"]);
  });

  // SightingCheckTest.colorsOutsideTheClosedListBecomeUnknown
  it("normalizes unrecognized colors even in daylight", () => {
    const result = checkSighting({ ...sighting, topColor: "teal-ish" }, 30);
    expect(result.cleaned.topColor).toBe("unknown");
    expect(result.colorSuppressed).toBe(false);
  });

  // SightingCheckTest.moreThanThreeCarriedItemsAreTrimmed
  it("keeps the first three carried items", () => {
    const result = checkSighting({ ...sighting, carriedItems: ["a", "b", "c", "d"] }, 30);
    expect(result.cleaned.carriedItems).toEqual(["a", "b", "c"]);
  });

  // SightingCheckTest.freeTextIsCappedAtTheSchemaLengths
  it("caps free text at the Android limits", () => {
    const long = "x".repeat(50);
    const { cleaned } = checkSighting({
      ...sighting, topType: long, footwear: long, headwear: long, carriedItems: [long], evidence: "e".repeat(500),
    }, 30);
    expect(cleaned.topType).toHaveLength(40);
    expect(cleaned.footwear).toHaveLength(40);
    expect(cleaned.headwear).toHaveLength(40);
    expect(cleaned.carriedItems).toEqual(["x".repeat(40)]);
    expect(cleaned.evidence).toHaveLength(400);
  });

  // SightingCheckTest.aGoodReadingPasses
  it("keeps a valid sighting intact", () => {
    expect(checkSighting(sighting, 30)).toEqual({ ok: true, reasons: [], cleaned: sighting, colorSuppressed: false });
  });

  // SchemaShapeTest.cameraSightingMatchesItsSchema, SchemaShapeTest.kotlinTypesCarryTheSchemaFieldNames
  // AiMappingTest.theClipSchemaNamesEveryCameraSightingField
  it("cleans a sighting with the same field names as the shared schema", () => {
    const input: CameraSightingInput = {
      personVisible: true, firstSeen: "00:01", lastSeen: "00:02", entryEdge: "left", exitEdge: "right",
      topColor: "blue", bottomColor: "black", topType: "", footwear: "", headwear: "", carriedItems: [],
      keyFrame: { time: "00:01", box2d: [1, 2, 3, 4] }, lighting: "day", legibility: "clear", evidence: "",
    };
    const { cleaned } = checkSighting(input, 2);
    expect(Object.keys(cleaned).sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.keys(cleaned.keyFrame).sort()).toEqual(Object.keys(schema.properties.keyFrame.properties).sort());
  });

  it("keeps the Android reason order and cleans failed sightings", () => {
    const result = checkSighting({
      ...sighting,
      personVisible: false,
      firstSeen: "00:40",
      lastSeen: "00:35",
      keyFrame: { time: "5s", box2d: [0, 0, 0, 1000] },
      bottomColor: "  PINK  ",
    }, 30);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual([
      "no_person", "key_frame_format", "first_after_last", "last_after_clip_end", "first_after_clip_end", "box",
    ]);
    expect(result.cleaned.bottomColor).toBe("pink");
  });

  it("accepts the clip endpoint and full frame bounds", () => {
    const result = checkSighting({
      ...sighting, lastSeen: " 00:30 ", keyFrame: { time: "00:30", box2d: [0, 0, 1000, 1000] },
    }, 30);
    expect(result.ok).toBe(true);
    expect(result.cleaned.lastSeen).toBe(" 00:30 ");
  });
});

describe("last seen time", () => {
  // SightingCheckTest.lastSeenMsAddsTheOffset
  it("adds the offset to the clip start in milliseconds", () => {
    expect(lastSeenMs(1_000_000, "02:14")).toBe(1_134_000);
  });

  // EventsTest.confirmingAClipWritesACameraSightingAndItsConfirmation (observedAtMs)
  it("computes the observed timestamp used to confirm a clip", () => {
    expect(lastSeenMs(1_000, "02:14")).toBe(135_000);
  });

  it("trims Kotlin whitespace and refuses malformed offsets with the Android message", () => {
    expect(lastSeenMs(1_000, "\u001f99:59\u00a0")).toBe(6_000_000);
    for (const time of ["2:14", "00:60", "000:00", "\ufeff02:14"]) {
      expect(() => lastSeenMs(1_000, time)).toThrow("lastSeen is not MM:SS");
    }
  });
});
