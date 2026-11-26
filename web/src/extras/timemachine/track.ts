import {
  TRACK_RULES,
  type BoxAt,
  type FootPoint,
  type Iou,
  type LinkTrack,
  type SpanAgrees,
  type TrackEntry,
  type TrackSpan,
} from "./types";

export const iou: Iou = (a, b) => {
  const height = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const width = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (height <= 0 || width <= 0) return 0;

  const intersection = height * width;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return intersection / (areaA + areaB - intersection);
};

export const linkTrack: LinkTrack = (entries) => {
  const segments: { startS: number; endS: number; entries: TrackEntry[] }[] = [];
  const sorted = [...entries].sort((a, b) => a.t - b.t);

  for (const entry of sorted) {
    const segment = segments.at(-1);
    const previous = segment?.entries.at(-1);
    // A stable sort lets the first input entry win at each second.
    if (previous?.t === entry.t) continue;

    if (
      segment && previous &&
      entry.t - previous.t - 1 <= TRACK_RULES.bridgeMaxGapS &&
      iou(previous.box, entry.box) >= TRACK_RULES.linkMinIoU
    ) {
      segment.entries.push(entry);
      segment.endS = entry.t;
    } else {
      segments.push({ startS: entry.t, endS: entry.t, entries: [entry] });
    }
  }
  return segments;
};

export const boxAt: BoxAt = (segments, timeS) => {
  const { holdS } = TRACK_RULES;
  if (!Number.isFinite(timeS)) return null;

  for (const segment of segments) {
    if (timeS < segment.startS - holdS || timeS > segment.endS + holdS) continue;

    const first = segment.entries[0];
    const last = segment.entries.at(-1);
    if (!first || !last) continue;
    if (timeS <= first.t) return first.box;
    if (timeS >= last.t) return last.box;

    let previous = first;
    for (const entry of segment.entries) {
      if (timeS === entry.t) return entry.box;
      if (timeS < entry.t) {
        const fraction = (timeS - previous.t) / (entry.t - previous.t);
        const lerp = (from: number, to: number) => from + (to - from) * fraction;
        return [
          lerp(previous.box[0], entry.box[0]),
          lerp(previous.box[1], entry.box[1]),
          lerp(previous.box[2], entry.box[2]),
          lerp(previous.box[3], entry.box[3]),
        ];
      }
      previous = entry;
    }
  }
  return null;
};

export const footPoint: FootPoint = ([, xMin, yMax, xMax]) => [(xMin + xMax) / 2, yMax];

export const trackSpan: TrackSpan = (segments) => {
  const first = segments[0];
  if (!first) return null;

  let firstS = first.startS;
  let lastS = first.endS;
  for (const segment of segments) {
    firstS = Math.min(firstS, segment.startS);
    lastS = Math.max(lastS, segment.endS);
  }
  return { firstS, lastS };
};

export const spanAgrees: SpanAgrees = (span, reading) =>
  Math.abs(span.firstS - reading.firstSeenS) <= TRACK_RULES.agreeWithinS &&
  Math.abs(span.lastS - reading.lastSeenS) <= TRACK_RULES.agreeWithinS;
