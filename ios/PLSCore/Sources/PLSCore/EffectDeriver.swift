import Foundation

/// A neighbour of a segment and the compass bearing to it from the segment's centre.
public struct NeighborBearing: Codable, Sendable, Equatable {
    public var segmentId: String
    public var bearingDeg: Double

    public init(segmentId: String, bearingDeg: Double) {
        self.segmentId = segmentId
        self.bearingDeg = bearingDeg
    }
}

/// What effect derivation needs to know about one segment.
public struct SegmentInfo: Codable, Sendable, Equatable {
    public var areaM2: Double
    public var neighbors: [NeighborBearing]
    public var upstream: [String]
    public var downstream: [String]

    public init(areaM2: Double, neighbors: [NeighborBearing], upstream: [String], downstream: [String]) {
        self.areaM2 = areaM2
        self.neighbors = neighbors
        self.upstream = upstream
        self.downstream = downstream
    }
}

/// What the creating device knows when it derives an effect (the vectors' `ctx`).
public struct EffectContext: Codable, Sendable, Equatable {
    public var segments: [String: SegmentInfo]
    public var assignedSegmentIds: [String]
    /// The team's visual detection range, measured once at the Ready check.
    public var visualDetectionRangeM: Double?
    public var rdBasis: RdBasis
    public var position: Position?
    /// The segment that contains `position`, computed by the caller with `Geo`.
    public var positionSegmentId: String?

    public init(segments: [String: SegmentInfo], assignedSegmentIds: [String], visualDetectionRangeM: Double?,
                rdBasis: RdBasis, position: Position?, positionSegmentId: String?) {
        self.segments = segments
        self.assignedSegmentIds = assignedSegmentIds
        self.visualDetectionRangeM = visualDetectionRangeM
        self.rdBasis = rdBasis
        self.position = position
        self.positionSegmentId = positionSegmentId
    }

    /// Builds the context from the pack's grid: neighbour bearings from the centroids, and the
    /// segment under the fix by point-in-polygon.
    public init(grid: [GridSegment], assignedSegmentIds: [String], position: Position?,
                visualDetectionRangeM: Double?, rdBasis: RdBasis) {
        let byId = Dictionary(uniqueKeysWithValues: grid.map { ($0.segmentId, $0) })
        var segments: [String: SegmentInfo] = [:]
        for s in grid {
            let neighbors = s.neighbors.compactMap { id in
                byId[id].map { NeighborBearing(segmentId: id, bearingDeg: Geo.bearingDeg(from: s.centroid, to: $0.centroid)) }
            }
            segments[s.segmentId] = SegmentInfo(areaM2: s.areaM2, neighbors: neighbors, upstream: s.upstream, downstream: s.downstream)
        }
        self.init(segments: segments, assignedSegmentIds: assignedSegmentIds, visualDetectionRangeM: visualDetectionRangeM,
                  rdBasis: rdBasis, position: position, positionSegmentId: position.flatMap { Geo.segment(containing: $0, in: grid) })
    }

    enum CodingKeys: String, CodingKey { case segments, assignedSegmentIds, visualDetectionRangeM, rdBasis, position, positionSegmentId }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(segments, forKey: .segments)
        try c.encode(assignedSegmentIds, forKey: .assignedSegmentIds)
        try c.encode(visualDetectionRangeM, forKey: .visualDetectionRangeM)
        try c.encode(rdBasis, forKey: .rdBasis)
        try c.encode(position, forKey: .position)
        try c.encode(positionSegmentId, forKey: .positionSegmentId)
    }

    /// First id the report named that is a known segment, else the first known assigned one.
    func namedOrAssigned(_ named: [String]) -> String? {
        named.first { segments[$0] != nil } ?? assignedSegmentIds.first { segments[$0] != nil }
    }
}

/// Effect derivation in code (spec sections 10.3 and 10.4), twin of deriveClearedEffect and
/// deriveClueEffect in TypeScript. The order of checks is pinned by the shared vectors.
public enum EffectDeriver {
    public static func cleared(reading: ReportReading, context: EffectContext, params: EngineParams) -> Effect {
        guard reading.kind == .cleared else { return .none(why: .invalid) }
        if reading.method == .sound && !params.detectionProfile.soundCounts { return .none(why: .soundOnly) }
        guard let id = context.namedOrAssigned(reading.segmentIds), let segment = context.segments[id] else {
            return .none(why: .needsCommand)
        }

        switch SearchMath.normalizeCoverage(reading.coverage) {
        case .invalid:
            return .none(why: .invalid)
        case let .ratio(c):
            return .cleared(segmentId: id, pod: SearchMath.pod(coverage: c),
                            inputs: ClearedInputs(coverage: c, sweepWidthM: nil, trackLengthM: nil,
                                                  areaM2: segment.areaM2, rdBasis: context.rdBasis))
        case .none:
            // The range the team measured at the Ready check comes first, with that step's
            // basis; a range the report states is used only when nothing was measured ("stated").
            let range: Double?, basis: RdBasis
            if let measured = context.visualDetectionRangeM {
                range = measured; basis = context.rdBasis
            } else {
                range = reading.detectionRangeM; basis = .stated
            }
            guard let minutes = reading.minutes, let searchers = reading.searchers, let range else { return .none(why: .needsCommand) }
            let w = SearchMath.sweepWidth(detectionRangeM: range, params: params)
            let l = SearchMath.trackLength(minutes: minutes, searchers: searchers, searchType: reading.searchType, params: params)
            let c = SearchMath.coverage(sweepWidthM: w, trackLengthM: l, areaM2: segment.areaM2)
            return .cleared(segmentId: id, pod: SearchMath.pod(coverage: c),
                            inputs: ClearedInputs(coverage: c, sweepWidthM: w, trackLengthM: l, areaM2: segment.areaM2, rdBasis: basis))
        }
    }

    /// Clue and sighting: the segment under the position is strong_for; neighbours the
    /// direction points at (within 45 degrees, inclusive, or along the stream lists) are for;
    /// all others stay neutral and are not listed. A position outside the grid changes nothing.
    public static func clue(reading: ReportReading, context: EffectContext) -> Effect {
        guard reading.kind == .clue || reading.kind == .sighting else { return .none(why: .invalid) }
        let id: String
        if context.position != nil {
            guard let p = context.positionSegmentId, context.segments[p] != nil else { return .none(why: .outsideArea) }
            id = p
        } else {
            guard let named = context.namedOrAssigned(reading.segmentIds) else { return .none(why: .needsCommand) }
            id = named
        }
        let segment = context.segments[id]!

        var influences: [String: Influence] = [id: .strongFor]
        let toward: [String]
        switch reading.direction {
        case .upstream: toward = segment.upstream
        case .downstream: toward = segment.downstream
        case .unknown: toward = []
        default:
            let target = reading.direction.bearingDeg!
            toward = segment.neighbors.filter { angleBetween($0.bearingDeg, target) <= 45 + 1e-9 }.map(\.segmentId)
        }
        for n in toward where context.segments[n] != nil && n != id { influences[n] = .for }
        return .clue(influences: influences, authenticity: reading.matchesProfile.authenticity)
    }

    /// Smallest angle between two compass bearings, 0 to 180 degrees.
    static func angleBetween(_ a: Double, _ b: Double) -> Double {
        let d = abs((a - b).truncatingRemainder(dividingBy: 360))
        return d > 180 ? 360 - d : d
    }
}
