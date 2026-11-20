import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { refuseJudgeSeed } from "./fixtures";

const seed = JSON.parse(readFileSync(new URL("../../shared/constants/judge-seed.json", import.meta.url), "utf8")) as { incidentId: string; testIncidentId: string };

// Live tests write (sightings, photos, consents, plans), so they must never run against the judge's seed.
test("the live-test fixtures refuse the judge's seeded incident and accept the test drill", { tag: "@no-backend" }, async () => {
  expect(() => refuseJudgeSeed(seed.incidentId)).toThrow(/judge's seed/);
  expect(() => refuseJudgeSeed(seed.testIncidentId)).not.toThrow();
});
