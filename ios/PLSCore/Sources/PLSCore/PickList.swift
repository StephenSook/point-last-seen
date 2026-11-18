import Foundation

/// What a person picked instead of saying or typing the report.
public struct PickListChoice: Sendable, Equatable {
    public var kind: ReportKind
    public var segmentId: String?
    /// For a clear: how long the team searched, and how many searched (code turns these into
    /// coverage with the measured detection range, as for a typed report).
    public var minutes: Double?
    public var searchers: Double?

    public init(kind: ReportKind, segmentId: String?, minutes: Double?, searchers: Double?) {
        self.kind = kind
        self.segmentId = segmentId
        self.minutes = minutes
        self.searchers = searchers
    }
}

/// A picked report: the same reading shape as a read one, with route stage `picklist` (a person
/// picked it; no model ran). The person's segment stands, because the "segments from the text or
/// the GPS fix" rule is there to overrule a model, not a person.
public enum PickList {
    public static func outcome(_ choice: PickListChoice, nowMs: Double) -> ReadOutcome {
        let reading = ReportReading(kind: choice.kind, segmentIds: choice.segmentId.map { [$0] } ?? [], method: .unknown,
                                    coverage: nil, minutes: choice.minutes, searchers: choice.searchers, searchType: .unknown,
                                    detectionRangeM: nil, item: "", feature: .none, direction: .unknown, topColor: .unknown,
                                    bottomColor: .unknown, footwear: "", carried: "", matchesProfile: .unknown, evidenceQuote: "")
        let route = RouteRecord(platform: .ios, path: .rules, stage: .picklist, model: "none", reason: .onDeviceDefault,
                                latencyMs: 0, sdkReported: false, blocked: nil, decidedAtMs: nowMs)
        return ReadOutcome(reading: reading, route: route, validation: .ok)
    }
}
