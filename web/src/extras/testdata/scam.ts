import type { ScamClip } from "../scam/scamModel";

// FIXTURE: made-up S-CAM results for tests and dev harnesses only. Not a real camera check; the real file is
// docs/evidence/spikes/SCAM.json, published to web/public/extras/scam.json by tools/extras/publish_scam.py.
export function scamClipFixture(over: Partial<ScamClip> = {}): ScamClip {
  return { id: "day-1", lighting: "day", timeErrorS: 30, bearingErrorDeg: 10, nightColorsUnknown: null, pass: true, missReasons: [], ...over };
}

export function scamFixture() {
  return {
    spike: "S-CAM",
    runAt: "2026-11-18T21:00:00Z",
    model: "fixture-model",
    clipSource: "staged",
    n: 6,
    passed: 5,
    clips: [
      scamClipFixture({ id: "night-1", lighting: "night_ir", timeErrorS: 40, bearingErrorDeg: 20, nightColorsUnknown: true }),
      scamClipFixture({ id: "night-2", lighting: "night_ir", timeErrorS: 35, bearingErrorDeg: 90, nightColorsUnknown: true, pass: false, missReasons: ["bearing"] }),
      scamClipFixture({ id: "night-3", lighting: "low_light", timeErrorS: -60, bearingErrorDeg: -30, nightColorsUnknown: true }),
      scamClipFixture({ id: "day-1" }),
      scamClipFixture({ id: "day-2", timeErrorS: 5, bearingErrorDeg: 0 }),
      scamClipFixture({ id: "day-3", timeErrorS: 110, bearingErrorDeg: 44 }),
    ] as ScamClip[],
  };
}
