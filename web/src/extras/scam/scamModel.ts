// The camera read check (spike S-CAM) as the judge page shows it. Every verdict is recomputed here from the stored
// errors: a stored pass is never trusted, and a file whose verdicts or counts disagree with its errors is refused.
// It is a go or no-go gate on a handful of staged clips, not an accuracy claim.

/** The pass line: last-seen time within 2 minutes and direction within 45 degrees of the truth. */
export const SCAM_LIMITS = { timeS: 120, bearingDeg: 45 } as const;
/** At least 5 of 6 clips pass, and no night clip names a color it cannot see. */
const GATE_PASS_OF_SIX = 5;

export type MissReason = "time" | "bearing" | "night_color" | "night_color_not_recorded" | "not_read";
export type ScamClip = {
  id: string;
  lighting: "day" | "night_ir" | "low_light" | "unknown";
  timeErrorS: number | null;
  bearingErrorDeg: number | null;
  /** Night clips only: did the read say "unknown" for every color it could not see. Null for a day clip. */
  nightColorsUnknown: boolean | null;
  pass: boolean;
  missReasons: MissReason[];
};
/** Where the clips came from, which decides the page's last line. */
export type ClipSource = "staged" | "stock";
export type ScamResult = { runAt: string; n: number; passed: number; clips: ScamClip[]; gatePassed: boolean; clipSource: ClipSource };

const LIGHTING = new Set(["day", "night_ir", "low_light", "unknown"]);
const REASONS = new Set<MissReason>(["time", "bearing", "night_color", "night_color_not_recorded", "not_read"]);
const FILE_FIELDS = new Set(["spike", "runAt", "model", "clipSource", "n", "passed", "clips"]);
const CLIP_FIELDS = new Set(["id", "lighting", "timeErrorS", "bearingErrorDeg", "nightColorsUnknown", "pass", "missReasons"]);

const isNight = (lighting: ScamClip["lighting"]) => lighting === "night_ir" || lighting === "low_light";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function recomputePass(c: Omit<ScamClip, "pass" | "missReasons">): { pass: boolean; missReasons: MissReason[] } {
  const missReasons: MissReason[] = [];
  if (c.timeErrorS === null || c.bearingErrorDeg === null) missReasons.push("not_read");
  else {
    if (Math.abs(c.timeErrorS) > SCAM_LIMITS.timeS) missReasons.push("time");
    if (Math.abs(c.bearingErrorDeg) > SCAM_LIMITS.bearingDeg) missReasons.push("bearing");
  }
  // A night clip whose color answer was not recorded cannot be shown to pass; it gets its own reason, because the
  // page must not say it named a color nobody checked.
  if (isNight(c.lighting) && c.nightColorsUnknown === false) missReasons.push("night_color");
  if (isNight(c.lighting) && c.nightColorsUnknown === null) missReasons.push("night_color_not_recorded");
  return { pass: missReasons.length === 0, missReasons };
}

const sameReasons = (a: readonly MissReason[], b: readonly MissReason[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function parseScam(json: unknown): { ok: true; result: ScamResult } | { ok: false; reason: string } {
  const no = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(json) || !Array.isArray(json["clips"]) || typeof json["runAt"] !== "string") return no("The file is not a camera check result.");
  const extra = Object.keys(json).find((k) => !FILE_FIELDS.has(k));
  if (extra) return no(`The file carries a field this page does not publish: ${extra}.`);
  const clipSource = json["clipSource"];
  if (clipSource !== "staged" && clipSource !== "stock") return no("The file does not say where the clips came from.");
  const clips: ScamClip[] = [];
  for (const raw of json["clips"] as unknown[]) {
    if (!isObj(raw) || typeof raw["id"] !== "string") return no("The file has a clip it cannot read.");
    const id = raw["id"];
    const field = Object.keys(raw).find((k) => !CLIP_FIELDS.has(k));
    if (field) return no(`Clip ${id} carries a field this page does not publish: ${field}.`);
    const { lighting, timeErrorS, bearingErrorDeg, nightColorsUnknown, pass, missReasons } = raw;
    if (!LIGHTING.has(lighting as string) || !(timeErrorS === null || num(timeErrorS)) || !(bearingErrorDeg === null || num(bearingErrorDeg))
      || !(nightColorsUnknown === null || typeof nightColorsUnknown === "boolean") || typeof pass !== "boolean"
      || !Array.isArray(missReasons) || !missReasons.every((r) => REASONS.has(r as MissReason))) {
      return no(`Clip ${id} cannot be read.`);
    }
    const c = { id, lighting: lighting as ScamClip["lighting"], timeErrorS, bearingErrorDeg, nightColorsUnknown, pass, missReasons: missReasons as MissReason[] };
    const again = recomputePass(c);
    if (again.pass !== c.pass || !sameReasons(again.missReasons, c.missReasons)) return no(`The stored verdict for clip ${id} does not match its errors.`);
    clips.push({ ...c, missReasons: again.missReasons });
  }
  if (json["n"] !== clips.length) return no("The clip count does not match the clips.");
  const passed = clips.filter((c) => c.pass).length;
  if (json["passed"] !== passed) return no("The passed count does not match the clips.");
  const nightColorMiss = clips.some((c) => c.missReasons.includes("night_color") || c.missReasons.includes("night_color_not_recorded"));
  const gatePassed = clips.length >= 6 && passed * 6 >= clips.length * GATE_PASS_OF_SIX && !nightColorMiss;
  return { ok: true, result: { runAt: json["runAt"], n: clips.length, passed, clips, gatePassed, clipSource } };
}

function clipName(id: string): string {
  const m = /^(day|night)-(\d+)$/.exec(id);
  return m ? `${m[1] === "day" ? "Day" : "Night"} clip ${m[2]}` : `Clip ${id}`;
}

/** "Night clip 2: direction off by 90 degrees (limit 45)." */
export function missLine(c: ScamClip): string {
  const parts = c.missReasons.map((r) => {
    switch (r) {
      case "time":
        return `last-seen time off by ${Math.abs(c.timeErrorS ?? 0)} s (limit ${SCAM_LIMITS.timeS})`;
      case "bearing":
        return `direction off by ${Math.abs(c.bearingErrorDeg ?? 0)} degrees (limit ${SCAM_LIMITS.bearingDeg})`;
      case "night_color":
        return "named a color it could not see at night";
      case "night_color_not_recorded":
        return "whether it named colors at night was not recorded";
      case "not_read":
        return "not read";
    }
  });
  return `${clipName(c.id)}: ${parts.join("; ")}.`;
}

export async function loadScam(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ state: "result"; result: ScamResult } | { state: "none" } | { state: "invalid"; reason: string } | { state: "unavailable" }> {
  let res: Response;
  try {
    res = await fetchFn("/extras/scam.json", { cache: "no-store" });
  } catch {
    return { state: "unavailable" };
  }
  if (res.status === 404) return { state: "none" };
  if (!res.ok) return { state: "unavailable" };
  // Hosting rewrites an unknown path to the app, so a missing file can arrive as HTML with status 200.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) return { state: "none" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "invalid", reason: "The file is not JSON." };
  }
  const parsed = parseScam(body);
  return parsed.ok ? { state: "result", result: parsed.result } : { state: "invalid", reason: parsed.reason };
}
