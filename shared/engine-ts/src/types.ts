// Types shared by the command post, Cloud Functions and tools. Interfaces named in
// a schema's "x-parity" map must keep exactly the schema's property names
// (scripts/check_schema_parity.py checks them).

export type Influence = "strong_for" | "for" | "neutral" | "against" | "strong_against";
export type Authenticity = "high" | "medium" | "low";
export type SearchType = "sweep" | "hasty" | "unknown";
export type SearchMethod = "visual" | "sound" | "both" | "unknown";
export type RdBasis = "hidden_target" | "open_target" | "default" | "stated";
export type NoneReason =
  | "needs_command" | "informational" | "invalid" | "sound_only" | "outside_area" | "incorporated_in_prior";
export type ClothingColor =
  | "black" | "white" | "gray" | "brown" | "tan" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink"
  | "unknown";
export type ReportKind = "cleared" | "sighting" | "clue" | "found" | "unclear";
export type Feature =
  | "creek_or_drainage" | "water" | "road" | "trail" | "structure" | "brush" | "woods" | "field" | "other" | "none";
export type Direction =
  | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | "upstream" | "downstream" | "unknown";
export type ProfileMatch = "consistent" | "inconsistent" | "unknown";
export type Role = "searcher" | "command" | "family";
export type EventType =
  | "cleared" | "clue" | "sighting" | "camera_sighting" | "destination" | "confirmation" | "retraction" | "found"
  | "plan_ack";
export type Reporter = "searcher" | "public_caller" | "family" | "camera" | "system";
export type PositionSource = "gps" | "assigned_segment" | "manual" | "map_click" | "camera_pin" | "none";
export type InputMethod = "keyboard_dictation" | "typed" | "picklist" | "clip" | "photo" | "system";
export type Terrain = "temperate_flat" | "temperate_mountain";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Position {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export interface ClearedInputs {
  coverage: number;
  sweepWidthM: number | null;
  trackLengthM: number | null;
  areaM2: number;
  rdBasis: RdBasis;
}

export type Effect =
  | { kind: "cleared"; segmentId: string; pod: number; inputs: ClearedInputs }
  | { kind: "clue"; influences: Record<string, Influence>; authenticity: Authenticity }
  | { kind: "none"; why: NoneReason };

export interface ReportReading {
  kind: ReportKind;
  segmentIds: string[];
  method: SearchMethod;
  coverage: number | null;
  minutes: number | null;
  searchers: number | null;
  searchType: SearchType;
  detectionRangeM: number | null;
  item: string;
  feature: Feature;
  direction: Direction;
  topColor: ClothingColor;
  bottomColor: ClothingColor;
  footwear: string;
  carried: string;
  matchesProfile: ProfileMatch;
  evidenceQuote: string;
}

export type RoutePath = "on_device" | "cloud" | "rules" | "unknown";
/** "picklist": a person picked the report from a list, so no model ran. */
export type ReadStage = "guided" | "permissive_text" | "deterministic_parser" | "evidence_protocol" | "sdk" | "picklist";
export type RouteReason =
  | "on_device_default" | "no_network" | "on_device_unavailable" | "locale_unsupported" | "over_token_budget"
  | "possible_evidence" | "not_drill_mode" | "sdk_prefer_in_cloud" | "sdk_prefer_on_device" | "sdk_only_in_cloud"
  | "sdk_only_on_device" | "sdk_fallback" | "link_down_fallback" | "template_fallback" | "consented_cloud_read"
  // Clip triage on the web: a flagged span read in the cloud; the laptop's model or a motion check finding
  // nothing (nothing sent; trace only); and the consented cloud read anyway after such a result.
  | "on_device_triage_flagged" | "on_device_triage_no_person" | "triage_no_motion" | "user_override_after_triage";

export interface RouteRecord {
  platform: "ios" | "web" | "android";
  path: RoutePath;
  stage: ReadStage;
  model: string;
  reason: RouteReason;
  latencyMs: number;
  sdkReported: boolean;
  blocked: "guardrail" | "refusal" | null;
  decidedAtMs: number;
}

export type ClipEdge = "left" | "right" | "top" | "bottom" | "toward_camera" | "away_from_camera" | "unknown";

export interface CameraSighting {
  personVisible: boolean;
  firstSeen: string;
  lastSeen: string;
  entryEdge: ClipEdge;
  exitEdge: ClipEdge;
  topColor: ClothingColor;
  bottomColor: ClothingColor;
  topType: string;
  footwear: string;
  headwear: string;
  carriedItems: string[];
  keyFrame: { time: string; box2d: [number, number, number, number] };
  lighting: "day" | "night_ir" | "low_light" | "unknown";
  legibility: "clear" | "partial" | "poor";
  evidence: string;
}

export interface PhotoCues {
  placeType:
    | "home" | "store" | "restaurant" | "place_of_worship" | "park" | "trail" | "water" | "road" | "parking_lot"
    | "transit" | "school" | "medical" | "other" | "unknown";
  placeName: string;
  signText: string;
  landmarks: string[];
  outdoors: "yes" | "no" | "unknown";
  evidence: string;
}

/** A camera sighting event's reading (ruling I10): the model's read plus the clip reference. */
export interface CameraSightingReading {
  sighting: CameraSighting;
  clipSha256: string;
  clipStartMs: number;
  clockConfirmed: boolean;
  cameraFacingDeg: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 | null;
}

export interface EventDoc {
  eventId: string;
  schemaVersion: 1;
  incidentId: string;
  teamId: string | null;
  deviceId: string;
  seq: number;
  authorUid: string;
  role: Role;
  type: EventType;
  reporter: Reporter;
  clientTimeMs: number;
  serverTime: unknown;
  observedAtMs: number | null;
  position: Position | null;
  positionSource: PositionSource;
  rawText: string | null;
  inputMethod: InputMethod;
  isTrainingInject: boolean;
  reading: ReportReading | CameraSightingReading | null;
  effect: Effect;
  route: RouteRecord | null;
  targetEventId: string | null;
  decision: "confirmed" | "rejected" | null;
  planVersion: number | null;
  priorVersion: number;
}

export interface Assignment {
  teamId: string;
  segmentIds: string[];
  taskText: string;
  reason: string;
}

export interface PlanDoc {
  version: number;
  basedOnEventSetHash: string;
  priorVersion: number;
  assignments: Assignment[];
  wordingRoute: RouteRecord | null;
  approvedByUid: string;
  approvedAt: unknown;
  createdClientTimeMs: number;
}

export interface PlanWording {
  assignments: { teamId: string; taskText: string; reason: string }[];
  summary: string;
}

export type DementiaType = "alzheimers" | "lewy_body" | "vascular" | "frontotemporal" | "mixed" | "other" | "unknown";

export interface ProfileFlags {
  mayNotRespond: boolean;
  likelyToHide: boolean;
  afraidOfUniforms: boolean;
  sensitiveToTouch: boolean;
  sensitiveToLight: boolean;
  likelyToFight: boolean;
  seizures: boolean;
  hallucinationsOrDelusions: boolean;
  lookingForHome: boolean;
  gaitUnsteady: boolean;
  freezing: boolean;
  fallRisk: boolean;
  softVoice: boolean;
  slowToRespond: boolean;
  fluctuates: boolean;
  medicationSensitivity: boolean;
  carriesMedicalAlertCard: boolean;
  medicationTimingMatters: boolean;
}

export interface SharedProfile {
  answersTo: string;
  /** Mirrors otherNames[0] when otherNames is present ("" for an empty list), so older readers still show one. */
  nickname: string;
  /** Other names she may answer to, 0 to 5, each 1 to 60 characters. Absent on profiles saved before the list. */
  otherNames?: string[];
  ageYears: number | null;
  gender: string;
  appearance: string;
  heightFt: number | null;
  heightIn: number | null;
  weightLb: number | null;
  hair: string;
  eyeColor: string;
  primaryLanguage: string;
  clothingLastWorn: string;
  mobilityAids: ("cane" | "walker" | "wheelchair" | "other")[];
  dementiaType: DementiaType | null;
  flags: ProfileFlags;
  triggersToAvoid: string;
  bestApproach: string;
  uniqueDescription: string;
  photoTakenOn: string | null;
  approachNoteIds: string[];
}

export interface Place {
  label: string;
  position: LatLon | null;
}

export interface CommandProfile {
  previousAddresses: Place[];
  placesFrequented: Place[];
  pastWandering: { foundWhere: string; position: LatLon | null }[];
  nearbyWater: string;
  vehicle: { involved: boolean; description: string } | null;
}

export interface GridSegment {
  segmentId: string;
  areaM2: number;
  centroid: LatLon;
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
  neighbors: string[];
  downstream: string[];
  upstream: string[];
  nearFrac: number;
  featureClasses: ("road" | "trail" | "stream" | "water" | "structure")[];
}

export interface Grid {
  gridId: string;
  cellM: 125;
  bbox: [number, number, number, number];
  segments: GridSegment[];
  attribution: string;
}

export interface RouteStation {
  x: number;
  y: number;
  hx: number;
  hy: number;
  nx: number;
  ny: number;
  segmentId: string | null;
}

export interface RouteGraph {
  graphId: string;
  gridId: string;
  stationSpacingM: 25;
  origin: LatLon;
  nodes: { nodeId: number; x: number; y: number }[];
  edges: { edgeId: number; class: "road" | "trail" | "stream" | "water_edge"; from: number; to: number; stations: RouteStation[] }[];
  /** The extract bounds [minLon, minLat, maxLon, maxLat] that mark boundary exits, or null for a graph with none. */
  bounds: [number, number, number, number] | null;
  /** Metres per degree at the origin, stored so no engine recomputes them with platform trigonometry. */
  projection: { metresPerDegreeLat: number; metresPerDegreeLon: number };
  attribution: string;
}

/** shared/schemas/incident-conditions.schema.json: the incident's typed conditions for the urgency chip. */
export interface IncidentConditions {
  tempF: number | null;
  wet: boolean | null;
  setAtMs: number;
}

// ---- engine types (not schema documents)

export interface EngineParams {
  sweepWidthFactor: number;
  sweepSpeedMps: number;
  hastySpeedMps: number;
  secondsPerMinute: number;
  iocBase: Record<Influence, number>;
  authenticityWeight: Record<Authenticity, number>;
  coverageRatioMax: number;
  coveragePercentMax: number;
  detectionRangeMinM: number;
  detectionRangeMaxM: number;
  detectionProfile: { soundCounts: boolean };
  rings: { masses: number[]; temperate_flat: number[]; temperate_mountain: number[] };
  nearFeature: { bufferM: number; nearShare: number; farShare: number };
  wedge: { halfAngleDeg: number; inside: number; outside: number };
}

export interface SegmentPrior {
  segmentId: string;
  priorPoa: number;
}

export interface EngineEvent {
  eventId: string;
  effect: Effect;
  /** Test vectors only: replaces the IOC table for the listed entries. */
  iocOverride?: Record<string, number>;
}

export interface PosteriorResult {
  poa: Record<string, number>;
  remainingMass: Record<string, number>;
  cumulativePod: Record<string, number>;
  appliedEventIds: string[];
  ignoredEventIds: string[];
}

export interface RankedSegment {
  segmentId: string;
  rank: number;
  poa: number;
  priorPoa: number;
  deltaPoa: number;
}

export interface DraftAssignment {
  teamId: string;
  segmentIds: string[];
}

export interface ContextSegment {
  areaM2: number;
  neighbors: { segmentId: string; bearingDeg: number }[];
  upstream: string[];
  downstream: string[];
}

export interface EffectContext {
  segments: Record<string, ContextSegment>;
  assignedSegmentIds: string[];
  visualDetectionRangeM: number | null;
  rdBasis: Exclude<RdBasis, "stated">;
  position: Position | null;
  /** The segment containing `position`, computed by the caller; null when outside the grid. */
  positionSegmentId: string | null;
}

export type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

/** A clip reading that found no usable sighting (shared/schemas/clip-no-sighting.schema.json). */
export type ClipNoSightingReason =
  | "no_person" | "first_seen_format" | "last_seen_format" | "key_frame_format" | "first_after_last" | "last_after_clip_end"
  | "first_after_clip_end" | "key_frame_after_clip_end" | "box" | "unreadable_reply" | "model_error";
export interface ClipNoSighting {
  status: "no_sighting";
  reasons: ClipNoSightingReason[];
}
