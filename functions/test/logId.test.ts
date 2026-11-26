import { describe, expect, it } from "vitest";
import { logIncidentId } from "../src/logId";

describe("logIncidentId", () => {
  it("logs a practice search's id, which names its visitor's uid, as a short hash", () => {
    const id = "judge-AbCdEf0123456789uidXyZ-0123456789ab";
    const logged = logIncidentId(id);
    expect(logged).toMatch(/^judge#[0-9a-f]{12}$/);
    expect(logged).not.toContain("AbCdEf0123456789uidXyZ");
    expect(logIncidentId(id)).toBe(logged);
    expect(logIncidentId("judge-other-0123456789ab")).not.toBe(logged);
  });

  it("logs any other incident id as it is", () => {
    expect(logIncidentId("drill-dev-1")).toBe("drill-dev-1");
  });
});
