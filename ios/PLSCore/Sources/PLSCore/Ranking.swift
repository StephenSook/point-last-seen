import Foundation

public struct RankedSegment: Codable, Sendable, Equatable {
    public var segmentId: String
    public var rank: Int
    public var poa: Double
    public var priorPoa: Double
    /// poa minus priorPoa: how much this segment moved since the prior.
    public var deltaPoa: Double
}

/// Ranked priority list for the phone (twin of rankSegments). ROW is left out: it is shown
/// on its own row as "outside the mapped area".
public enum Ranking {
    public static func rank(_ result: PosteriorResult, prior: [SegmentPrior]) -> [RankedSegment] {
        let priorById = Dictionary(uniqueKeysWithValues: prior.map { ($0.segmentId, $0.priorPoa) })
        let sorted = prior
            .map(\.segmentId)
            .filter { $0 != SegmentIDs.row }
            .sorted { a, b in
                let pa = result.poa[a] ?? 0, pb = result.poa[b] ?? 0
                return pa != pb ? pa > pb : a < b
            }
        return sorted.enumerated().map { i, id in
            let poa = result.poa[id] ?? 0, prior = priorById[id] ?? 0
            return RankedSegment(segmentId: id, rank: i + 1, poa: poa, priorPoa: prior, deltaPoa: poa - prior)
        }
    }
}
