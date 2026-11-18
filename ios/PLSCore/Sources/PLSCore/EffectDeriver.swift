import Foundation

/// What the creating device knows when it derives an effect.
public struct EffectContext: Sendable, Equatable {
    public var segments: [GridSegment]
    public var assignedSegmentIds: [String]
    public var position: Position?
    /// The team's visual detection range, measured once at the Ready check.
    public var visualDetectionRangeM: Double?
    public var rdBasis: RdBasis

    public init(segments: [GridSegment], assignedSegmentIds: [String], position: Position?,
                visualDetectionRangeM: Double?, rdBasis: RdBasis) {
        self.segments = segments
        self.assignedSegmentIds = assignedSegmentIds
        self.position = position
        self.visualDetectionRangeM = visualDetectionRangeM
        self.rdBasis = rdBasis
    }

    var byId: [String: GridSegment] { Dictionary(uniqueKeysWithValues: segments.map { ($0.segmentId, $0) }) }

    /// First known id the report named, else the team's first known assigned segment.
    func namedOrAssigned(_ named: [String]) -> GridSegment? {
        let map = byId
        if let id = named.first(where: { map[$0] != nil }) { return map[id] }
        if let id = assignedSegmentIds.first(where: { map[$0] != nil }) { return map[id] }
        return nil
    }
}

/// Effect derivation in code (spec sections 10.3 and 10.4), twin of deriveClearedEffect and
/// deriveClueEffect in TypeScript.
public enum EffectDeriver {
    public static func cleared(reading: ReportReading, context: EffectContext, params: EngineParams) -> Effect {
        if reading.method == .sound && !params.detectionProfile.soundCounts { return .none(why: .soundOnly) }
        guard let segment = context.namedOrAssigned(reading.segmentIds) else { return .none(why: .needsCommand) }

        switch SearchMath.normalizeCoverage(reading.coverage) {
        case .invalid:
            return .none(why: .invalid)
        case let .ratio(c):
            return .cleared(segmentId: segment.segmentId, pod: SearchMath.pod(coverage: c),
                            inputs: ClearedInputs(coverage: c, sweepWidthM: nil, trackLengthM: nil,
                                                  areaM2: segment.areaM2, rdBasis: context.rdBasis))
        case .none:
            // Sweep width uses the measured visual range; a range stated in the report is used
            // only when the team skipped the Ready-check step, and is marked "default".
            let range: Double?, basis: RdBasis
            if let measured = context.visualDetectionRangeM {
                range = measured; basis = context.rdBasis
            } else {
                range = reading.detectionRangeM; basis = .default
            }
            guard let minutes = reading.minutes, let searchers = reading.searchers, let range,
                  minutes > 0, searchers > 0, range > 0, segment.areaM2 > 0 else { return .none(why: .needsCommand) }
            let w = SearchMath.sweepWidth(detectionRangeM: range, params: params)
            let l = SearchMath.trackLength(minutes: minutes, searchers: searchers, searchType: reading.searchType, params: params)
            let c = SearchMath.coverage(sweepWidthM: w, trackLengthM: l, areaM2: segment.areaM2)
            return .cleared(segmentId: segment.segmentId, pod: SearchMath.pod(coverage: c),
                            inputs: ClearedInputs(coverage: c, sweepWidthM: w, trackLengthM: l, areaM2: segment.areaM2, rdBasis: basis))
        }
    }

    /// Clue and confirmed sighting: the cell under the position is strong_for; neighbours the
    /// direction points at (within 45 degrees, or along the stream lists) are for; all others
    /// stay neutral. A position outside the grid changes nothing.
    public static func clue(reading: ReportReading, context: EffectContext) -> Effect {
        let segment: GridSegment
        if let position = context.position {
            guard let id = Geo.segment(containing: position, in: context.segments), let s = context.byId[id] else {
                return .none(why: .outsideArea)
            }
            segment = s
        } else {
            guard let s = context.namedOrAssigned(reading.segmentIds) else { return .none(why: .needsCommand) }
            segment = s
        }

        let map = context.byId
        var influences: [String: Influence] = [segment.segmentId: .strongFor]
        let toward: [String]
        switch reading.direction {
        case .upstream: toward = segment.upstream
        case .downstream: toward = segment.downstream
        case .unknown: toward = []
        default:
            let target = reading.direction.bearingDeg!
            toward = segment.neighbors.filter { id in
                guard let n = map[id] else { return false }
                let b = Geo.bearingDeg(from: segment.centroid, to: n.centroid)
                let diff = abs(((b - target).truncatingRemainder(dividingBy: 360) + 540).truncatingRemainder(dividingBy: 360) - 180)
                return diff <= 45 + 1e-9
            }
        }
        for id in toward where map[id] != nil && id != segment.segmentId { influences[id] = .for }
        return .clue(influences: influences, authenticity: reading.matchesProfile.authenticity)
    }
}
