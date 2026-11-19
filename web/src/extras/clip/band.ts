// The person-in-view band for a clip. Today the only stored interval is the
// cloud reading's first seen to last seen. On-device triage stores no per-window checks, so
// "device_check" intervals are drawn only when a caller passes them (none does yet).

export type BandInterval = { startS: number; endS: number; source: "cloud_read" | "device_check" };
type Seen = { personVisible: boolean; firstSeen: string; lastSeen: string };

const MMSS = /^(\d{2}):([0-5]\d)$/;
export function seconds(mmss: string): number | null {
  const m = MMSS.exec(mmss.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function intervalsFromReading(s: Seen): BandInterval[] {
  const a = seconds(s.firstSeen);
  const b = seconds(s.lastSeen);
  if (!s.personVisible || a === null || b === null || a > b) return [];
  return [{ startS: a, endS: b, source: "cloud_read" }];
}

export function bandText(s: Seen): string {
  return intervalsFromReading(s).length > 0 ? `Person in view ${s.firstSeen} to ${s.lastSeen}` : "No person seen.";
}

const MIN_W = 2;

export function bandModel(durationS: number | null, intervals: readonly BandInterval[], keyFrameS: number | null, widthPx: number) {
  const openEnded = durationS === null;
  const scale = durationS ?? Math.max(1, ...intervals.map((i) => i.endS));
  const clamp = (v: number) => Math.min(scale, Math.max(0, v));
  const px = (s: number) => (clamp(s) / scale) * widthPx;
  const rects = intervals.map((i) => ({ x: px(i.startS), w: Math.max(MIN_W, px(i.endS) - px(i.startS)), source: i.source }));
  return { rects, keyX: keyFrameS === null ? null : px(keyFrameS), openEnded, scale };
}
