import Foundation
@testable import PLSCore

/// Engine numbers from the plan's Global Constraints. In the app they arrive in the pack;
/// tests build them here so every expected value below can be checked by hand.
let params = EngineParams(
    sweepWidthFactor: 1.645,
    sweepSpeedMps: 0.39,
    hastySpeedMps: 0.53,
    iocBase: IocBase(strongFor: 1.0, for: 0.8, neutral: 0.6, against: 0.4, strongAgainst: 0.2),
    authenticityWeight: AuthenticityWeight(high: 1.0, medium: 0.6, low: 0.0),
    detectionProfile: DetectionProfile(soundCounts: false)
)

func near(_ a: Double?, _ b: Double, rel: Double = 1e-12) -> Bool {
    guard let a else { return false }
    if a == b { return true }
    return abs(a - b) <= rel * max(abs(a), abs(b))
}

/// A 2 x 2 test grid of 0.001-degree squares on the equator (so east-west and north-south
/// scale alike). Row-major: AA AB on top, AC AD below.
func square(_ id: String, lon: Double, lat: Double, neighbors: [String], upstream: [String] = [], downstream: [String] = []) -> GridSegment {
    let d = 0.001
    let ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]].map { Coordinate(lon: $0[0], lat: $0[1]) }
    return GridSegment(segmentId: id, areaM2: 15_625, centroid: Coordinate(lon: lon + d / 2, lat: lat + d / 2),
                       geometry: SegmentGeometry(polygons: [[ring]]), neighbors: neighbors, upstream: upstream, downstream: downstream)
}

let grid: [GridSegment] = [
    square("AA", lon: 10.000, lat: 0.001, neighbors: ["AB", "AC"], downstream: ["AC"]),
    square("AB", lon: 10.001, lat: 0.001, neighbors: ["AA", "AD"]),
    square("AC", lon: 10.000, lat: 0.000, neighbors: ["AA", "AD"], upstream: ["AA"]),
    square("AD", lon: 10.001, lat: 0.000, neighbors: ["AB", "AC"])
]

func reading(
    kind: ReportKind = .cleared, segmentIds: [String] = ["AC"], method: SearchMethod = .visual, coverage: Double? = nil,
    minutes: Double? = nil, searchers: Double? = nil, searchType: SearchType = .sweep, detectionRangeM: Double? = nil,
    direction: Direction = .unknown, matchesProfile: ProfileMatch = .unknown, evidenceQuote: String = "cleared segment AC"
) -> ReportReading {
    ReportReading(kind: kind, segmentIds: segmentIds, method: method, coverage: coverage, minutes: minutes, searchers: searchers,
                  searchType: searchType, detectionRangeM: detectionRangeM, item: "", feature: .none, direction: direction,
                  topColor: .unknown, bottomColor: .unknown, footwear: "", carried: "", matchesProfile: matchesProfile,
                  evidenceQuote: evidenceQuote)
}

func ctx(position: Position? = nil, assigned: [String] = ["AC"], rangeM: Double? = 10, basis: RdBasis = .openTarget) -> EffectContext {
    EffectContext(segments: grid, assignedSegmentIds: assigned, position: position, visualDetectionRangeM: rangeM, rdBasis: basis)
}

/// A point in the middle of a test cell.
func inside(_ id: String) -> Position {
    let c = grid.first { $0.segmentId == id }!.centroid
    return Position(lat: c.lat, lon: c.lon, accuracyM: 8)
}

func doc(_ id: String, _ type: EventType, effect: Effect = .none(why: .informational), target: String? = nil,
         decision: Decision? = nil, role: Role = .searcher, author: String = "u1") -> EventDoc {
    EventDoc(eventId: id, schemaVersion: 1, incidentId: "I1", teamId: "T1", deviceId: "D1", seq: 1, authorUid: author,
             role: role, type: type, reporter: .searcher, clientTimeMs: 1_000, serverTime: nil, observedAtMs: nil,
             position: nil, positionSource: .none, rawText: nil, inputMethod: .system, isTrainingInject: false,
             reading: nil, effect: effect, route: nil, targetEventId: target, decision: decision, planVersion: nil, priorVersion: 1)
}

let clearAC = Effect.cleared(segmentId: "AC", pod: 0.5, inputs: ClearedInputs(coverage: 0.69, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget))
func clue(_ a: Authenticity) -> Effect { .clue(influences: ["AA": .strongFor], authenticity: a) }
