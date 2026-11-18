import Foundation

public struct SegmentPrior: Codable, Sendable, Equatable {
    public var segmentId: String
    public var priorPoa: Double

    public init(segmentId: String, priorPoa: Double) {
        self.segmentId = segmentId
        self.priorPoa = priorPoa
    }
}

/// One event the engine applies: its id and its stored effect. `iocOverride` lets a test case
/// pass published IOC values per segment (the CASIE worked example); the app never sets it.
public struct EngineEvent: Codable, Sendable, Equatable {
    public var eventId: String
    public var effect: Effect
    public var iocOverride: [String: Double]?

    public init(eventId: String, effect: Effect, iocOverride: [String: Double]? = nil) {
        self.eventId = eventId
        self.effect = effect
        self.iocOverride = iocOverride
    }
}

public struct PosteriorResult: Codable, Sendable, Equatable {
    public var poa: [String: Double]
    /// prior x product(1 - pod) per segment, before normalization.
    public var remainingMass: [String: Double]
    /// 1 - product(1 - pod) per segment.
    public var cumulativePod: [String: Double]
    public var appliedEventIds: [String]
    public var ignoredEventIds: [String]
}

/// Bayesian update over the prior and the event set (spec section 10.1).
/// Events are applied in ascending eventId order and repeats are dropped, so every seat with
/// the same event set gets the same numbers. ROW is carried through every update.
public enum Posterior {
    public static func compute(prior: [SegmentPrior], events: [EngineEvent], params: EngineParams) -> PosteriorResult {
        let ids = prior.map(\.segmentId)
        let known = Set(ids)
        var weight = Dictionary(uniqueKeysWithValues: prior.map { ($0.segmentId, $0.priorPoa) })
        var miss = Dictionary(uniqueKeysWithValues: ids.map { ($0, 1.0) })
        var applied: [String] = []
        var ignored: [String] = []
        var seen = Set<String>()

        for event in events.sorted(by: { $0.eventId < $1.eventId }) {
            guard seen.insert(event.eventId).inserted else { continue }      // a repeat is the same event, not a failed one
            switch event.effect {
            case let .cleared(segmentId, pod, _):
                guard known.contains(segmentId), pod.isFinite, pod >= 0, pod <= 1 else { ignored.append(event.eventId); continue }
                weight[segmentId]! *= (1 - pod)
                miss[segmentId]! *= (1 - pod)
                applied.append(event.eventId)
            case let .clue(influences, authenticity):
                if let override = event.iocOverride {
                    for id in ids { weight[id]! *= override[id] ?? 1 }
                } else {
                    guard influences.keys.contains(where: known.contains) else { ignored.append(event.eventId); continue }
                    for id in ids {
                        weight[id]! *= SearchMath.ioc(influences[id] ?? .neutral, authenticity: authenticity, params: params)
                    }
                }
                applied.append(event.eventId)
            case .none:
                ignored.append(event.eventId)
            }
        }

        let total = ids.reduce(0) { $0 + weight[$1]! }
        let poa = Dictionary(uniqueKeysWithValues: ids.map { ($0, total > 0 ? weight[$0]! / total : 0) })
        let remaining = Dictionary(uniqueKeysWithValues: prior.map { ($0.segmentId, $0.priorPoa * miss[$0.segmentId]!) })
        let cumulative = Dictionary(uniqueKeysWithValues: ids.map { ($0, 1 - miss[$0]!) })
        return PosteriorResult(poa: poa, remainingMass: remaining, cumulativePod: cumulative, appliedEventIds: applied, ignoredEventIds: ignored)
    }
}
