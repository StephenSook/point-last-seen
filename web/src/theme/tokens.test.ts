import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, hueDeg, lightness } from "./contrast";
import { COMMAND, dotRadiusPx, POA_RAMP, textPairAllowed } from "./tokens";

const BGS = ["bg0", "bg1", "bg2", "bg3"] as const;
const TEXT = ["fg1", "fg2", "fg3", "fg4", "changeCyan", "alertRed"] as const;

describe("command post tokens (spec 22.1)", () => {
  it("every allowed text pair is 4.5 to 1 or better", () => {
    for (const f of TEXT) for (const b of BGS) if (textPairAllowed(f, b)) expect(contrast(COMMAND[f], COMMAND[b]), `${f} on ${b}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the three failing pairs are not allowed", () => {
    expect(textPairAllowed("fg4", "bg2")).toBe(false);
    expect(textPairAllowed("fg4", "bg3")).toBe(false);
    expect(textPairAllowed("alertRed", "bg3")).toBe(false);
    expect(contrast(COMMAND.fg4, COMMAND.bg2)).toBeLessThan(4.5);
  });

  it("measured anchors match the spec table", () => {
    expect(contrast("#F8F4F1", "#1C1917")).toBeCloseTo(15.99, 1);
    expect(contrast("#898583", "#1C1917")).toBeCloseTo(4.79, 1);
    expect(contrast("#40E2F3", "#1C1917")).toBeCloseTo(11.15, 1);
    expect(contrast("#F84B4B", "#1C1917")).toBeCloseTo(5.08, 1);
  });

  it("the ramp is eight steps of one warm hue with rising lightness", () => {
    expect(POA_RAMP).toEqual(["#342D23", "#534229", "#765729", "#9A6E2A", "#BD8630", "#DEA143", "#FCC270", "#FFEAC2"]);
    const h = POA_RAMP.map(hueDeg);
    expect(Math.max(...h) - Math.min(...h)).toBeLessThan(6);
    const l = POA_RAMP.map(lightness);
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeGreaterThan(l[i - 1]!);
  });

  it("probability is never red or cyan", () => {
    for (const c of POA_RAMP) {
      expect(Math.abs(hueDeg(c) - hueDeg(COMMAND.alertRed))).toBeGreaterThan(25);
      expect(c).not.toBe(COMMAND.changeCyan);
    }
  });

  it("the number sits on a plate, because no ink passes on step 3", () => {
    expect(Math.max(contrast("#F8F4F1", POA_RAMP[3]), contrast("#110F0D", POA_RAMP[3]))).toBeLessThan(4.5);
    expect(contrast(COMMAND.plateFg, COMMAND.plateBg)).toBeGreaterThanOrEqual(17);
  });

  it("the moved outline is cased, because cyan fails on the lightest steps", () => {
    expect(contrast(COMMAND.changeCyan, POA_RAMP[6])).toBeLessThan(3);
    expect(contrast(COMMAND.bg0, POA_RAMP[6])).toBeGreaterThanOrEqual(3);
  });

  it("dot size is the second signal", () => {
    expect(dotRadiusPx(0, 0.31)).toBe(3);
    expect(dotRadiusPx(0.31, 0.31)).toBe(14);
    expect(dotRadiusPx(0.2, 0.31)).toBeGreaterThan(dotRadiusPx(0.1, 0.31));
    expect(dotRadiusPx(0.1, 0)).toBe(3);
  });

  it("base.css declares the same values as the tokens", () => {
    const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
    const css = (name: string) => baseCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toUpperCase();
    const map: [string, keyof typeof COMMAND][] = [["bg-0", "bg0"], ["bg-1", "bg1"], ["bg-2", "bg2"], ["bg-3", "bg3"], ["line", "line"], ["fg-1", "fg1"], ["fg-2", "fg2"], ["fg-3", "fg3"], ["fg-4", "fg4"], ["change-cyan", "changeCyan"], ["alert-red", "alertRed"]];
    for (const [v, k] of map) expect(css(v), v).toBe(COMMAND[k]);
  });

});
