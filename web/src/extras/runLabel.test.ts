import { describe, expect, it } from "vitest";
import { runLabelLine } from "./runLabel";

const DRILL = "Training drill. Nobody is missing.";

describe("runLabelLine", () => {
  it("drops a trailing drill line, so the replay's own line is the only one", () => {
    expect(runLabelLine(`Development drill, Piedmont Park, Atlanta, 2026-11-18 to 19. ${DRILL}`, DRILL)).toBe("Development drill, Piedmont Park, Atlanta, 2026-11-18 to 19.");
  });
  it("keeps a label that does not carry the drill line", () => {
    expect(runLabelLine("REAL DRILL, Kennesaw Mountain, 2026-11-22", DRILL)).toBe("REAL DRILL, Kennesaw Mountain, 2026-11-22");
  });
  it("shows nothing for a label that is only the drill line, or empty", () => {
    expect(runLabelLine(DRILL, DRILL)).toBeNull();
    expect(runLabelLine(`  ${DRILL}  `, DRILL)).toBeNull();
    expect(runLabelLine("   ", DRILL)).toBeNull();
    expect(runLabelLine(undefined, DRILL)).toBeNull();
    expect(runLabelLine(42, DRILL)).toBeNull();
  });
  it("drops the drill line wherever it sits in the label", () => {
    expect(runLabelLine(`${DRILL} Kennesaw Mountain.`, DRILL)).toBe("Kennesaw Mountain.");
  });
  it("keeps the whole label when the run has no drill line", () => {
    expect(runLabelLine(`Search run. ${DRILL}`, null)).toBe(`Search run. ${DRILL}`);
  });
});
