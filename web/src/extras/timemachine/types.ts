// The clip time machine's shared contract, frozen before the track math, the clock and the 3D view
// are built, so each part is built against the same shapes. Types and the plan's fixed numbers
// only: no behaviour lives here.
//
// Coordinates: every box is [yMin, xMin, yMax, xMax] on a 0 to 1000 scale of the frame, the order
// the cloud model returns. Time: seconds from the clip's start (the model stamps whole seconds).

/** One box around the person, [yMin, xMin, yMax, xMax] on a 0 to 1000 scale. yMin < yMax, xMin < xMax. */
export type Box2d = readonly [yMin: number, xMin: number, yMax: number, xMax: number];

/** Where a box came from: the cloud track read, or this laptop's own model on one frame. */
export type BoxSource = "cloud" | "on_device";

/** The person's outline in one frame: a closed polygon of [y, x] points on the same 0 to 1000 scale as a box. */
export type Mask = ReadonlyArray<readonly [y: number, x: number]>;

/**
 * One second of the track. `t` is a whole second from the clip's start; a track has at most one entry per `t`.
 * `mask` is the outline when the mask read returned one for that frame; a box without it still stands.
 */
export type TrackEntry = { readonly t: number; readonly box: Box2d; readonly source: BoxSource; readonly mask?: Mask };

/** The track read's prompt version. A new prompt gets a new version, so stored tracks stay valid. */
export type ClipTrackVersion = "track-v1";

/**
 * A clip's track as the view reads it. `entries` are sorted by `t`, strictly increasing, each
 * inside `window` (the flagged seconds the cloud read covered).
 */
export type Track = {
  readonly version: ClipTrackVersion;
  readonly window: { readonly startS: number; readonly endS: number };
  readonly entries: readonly TrackEntry[];
};

/** The plan's fixed numbers for the track math. */
export const TRACK_RULES = {
  /** Two neighbouring entries are the same person's track when their boxes overlap by at least this IoU. */
  linkMinIoU: 0.3,
  /** A run of missing seconds this long or shorter is bridged inside one segment. */
  bridgeMaxGapS: 2,
  /** The track's first and last second agree with the reading's when each is within this many seconds. */
  agreeWithinS: 1,
  /** A segment's box is shown this far before its first entry and after its last. */
  holdS: 0.5,
} as const;

/** A linked run of the track: entries that pass the link and bridge rules, in time order. */
export type TrackSegment = { readonly startS: number; readonly endS: number; readonly entries: readonly TrackEntry[] };

/** Intersection over union of two boxes, 0 to 1. Boxes that do not overlap give 0. */
export type Iou = (a: Box2d, b: Box2d) => number;

/**
 * Splits a track into segments. A new segment starts where the IoU with the previous entry is below
 * `linkMinIoU` or where more than `bridgeMaxGapS` seconds are missing.
 */
export type LinkTrack = (entries: readonly TrackEntry[]) => TrackSegment[];

/**
 * The box at any moment, for drawing at video frame rate: linear on each corner between the two
 * entries around `timeS` in the same segment (bridged gaps included), the end entry's box within
 * `holdS` outside a segment's ends, and null anywhere else.
 */
export type BoxAt = (segments: readonly TrackSegment[], timeS: number) => Box2d | null;

/** The bottom centre of a box, where the person stands: [x, y] on the 0 to 1000 scale. */
export type FootPoint = (box: Box2d) => readonly [x: number, y: number];

/** The first and last second any segment covers, or null for an empty track. */
export type TrackSpan = (segments: readonly TrackSegment[]) => { readonly firstS: number; readonly lastS: number } | null;

/** Whether a track's span agrees with the reading's first and last seen, each within `agreeWithinS`. */
export type SpanAgrees = (
  span: { readonly firstS: number; readonly lastS: number },
  reading: { readonly firstSeenS: number; readonly lastSeenS: number },
) => boolean;

/** Who last moved the shared clock. A listener ignores ticks from its own source, so the player and the scene never fight. */
export type ClockSource = "video" | "scene" | "tween";

/** One moment of the shared clock. */
export type ClockTick = { readonly timeS: number; readonly source: ClockSource };

/** The one clock the video, the 3D view and the 2D box overlay all follow. */
export type TimeClock = {
  now(): ClockTick;
  /** Moves the clock, clamped to 0..durationS, tagged with who moved it. */
  set(timeS: number, source: ClockSource): void;
  /** Tweens to `timeS` over `ms` (400 by default) with 'tween' ticks, then one 'scene' tick at the end. */
  jumpTo(timeS: number, ms?: number): void;
  /** Seconds per video frame: 1/30 until the video reports its own frame timing. */
  frameS(): number;
  subscribe(listener: (tick: ClockTick) => void): () => void;
};

/** Makes the shared clock for one clip. */
export type CreateClock = (opts: { readonly durationS: number }) => TimeClock;

/**
 * Ties a video to the clock: while it plays, its frames move the clock ('video'); a 'scene' tick
 * pauses it and seeks it there (seeks are queued, the last one wins). Returns the unbind.
 */
export type BindVideo = (clock: TimeClock, video: HTMLVideoElement) => () => void;

/** One row of the results list. The caller writes the label ("First seen 0:04"); a click jumps the clock. */
export type TimeMachineResult = {
  readonly id: "first_seen" | "clearest" | "last_seen" | "leaves";
  readonly label: string;
  readonly timeS: number;
};

/** What the command post hands the time machine view. */
export type TimeMachineProps = {
  /** The clip, played from an object URL so frames can be drawn to a canvas. The caller owns it. */
  readonly video: HTMLVideoElement;
  readonly durationS: number;
  /** Null when the clip has no track: the view shows the key frame and first and last seen only. */
  readonly track: Track | null;
  readonly keyFrame: { readonly timeS: number; readonly box: Box2d } | null;
  readonly results: readonly TimeMachineResult[];
  /** The clock the caller made, shared with the 2D box overlay on the player. */
  readonly clock: TimeClock;
};
