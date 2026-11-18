import Foundation

/// The incident's `conditions` (`shared/schemas/incident-conditions.schema.json`), typed at
/// command: a temperature in °F and whether the person is likely wet. The urgency chip's inputs.
public struct IncidentConditions: Codable, Sendable, Equatable {
    public var tempF: Double?
    public var wet: Bool?
    public var setAtMs: Double

    public init(tempF: Double?, wet: Bool?, setAtMs: Double) {
        self.tempF = tempF
        self.wet = wet
        self.setAtMs = setAtMs
    }

    enum CodingKeys: String, CodingKey { case tempF, wet, setAtMs }

    /// All three keys, nulls written out (the schema requires them).
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(tempF, forKey: .tempF)
        try c.encode(wet, forKey: .wet)
        try c.encode(setAtMs, forKey: .setAtMs)
    }

    /// Reads the incident document's `conditions` field; nil when it is absent or not an object.
    public init?(incidentField: JSONValue?) {
        guard case let .object(o)? = incidentField else { return nil }
        let temp: Double? = { if case let .number(n)? = o["tempF"], n.isFinite { n } else { nil } }()
        let wet: Bool? = { if case let .bool(b)? = o["wet"] { b } else { nil } }()
        let set: Double = { if case let .number(n)? = o["setAtMs"], n.isFinite { n } else { 0 } }()
        self.init(tempF: temp, wet: wet, setAtMs: set)
    }
}

extension UrgencyRule {
    /// No conditions give no chip, as the shared engine's `urgencyFromConditions` does.
    public func level(conditions: IncidentConditions?) -> UrgencyLevel {
        guard let conditions else { return .none }
        return level(tempF: conditions.tempF, wet: conditions.wet)
    }
}
