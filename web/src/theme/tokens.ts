// The command post's colours (spec 22.1), measured per pair. base.css declares the
// same values as CSS custom properties; a test holds the two together.

export const COMMAND = {
  bg0: "#110F0D",
  bg1: "#1C1917",
  bg2: "#252220",
  bg3: "#302D2B",
  line: "#403C3A",
  fg1: "#F8F4F1",
  fg2: "#D7D3D0",
  fg3: "#AEAAA7",
  fg4: "#898583",
  changeCyan: "#40E2F3",
  alertRed: "#F84B4B",
  plateBg: "#110F0D",
  plateFg: "#F8F4F1",
} as const;

/** Probability: eight lightness steps of one warm hue, darkest to lightest. Never red, never hue. */
export const POA_RAMP = ["#342D23", "#534229", "#765729", "#9A6E2A", "#BD8630", "#DEA143", "#FCC270", "#FFEAC2"] as const;

type Ink = "fg1" | "fg2" | "fg3" | "fg4" | "changeCyan" | "alertRed";
type Ground = "bg0" | "bg1" | "bg2" | "bg3";

// The spec table marks these "not allowed": each is under 4.5 to 1.
const NOT_ALLOWED = new Set(["fg4/bg2", "fg4/bg3", "alertRed/bg3"]);

export function textPairAllowed(fg: Ink, bg: Ground): boolean {
  return !NOT_ALLOWED.has(`${fg}/${bg}`);
}

/** The second signal: a dot radius of 3 + 11 x sqrt(poa / maxPoa) px, 3 to 14 px. */
export function dotRadiusPx(poa: number, maxPoa: number): number {
  return maxPoa > 0 && poa > 0 ? 3 + 11 * Math.sqrt(Math.min(1, poa / maxPoa)) : 3;
}
