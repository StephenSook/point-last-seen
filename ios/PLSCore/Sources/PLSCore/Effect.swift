import Foundation

/// Why an event changes nothing on the map (spec section 8).
public enum NoneReason: String, Codable, Sendable, CaseIterable {
    case needsCommand = "needs_command"
    case informational
    case invalid
    case soundOnly = "sound_only"
    case outsideArea = "outside_area"
    case incorporatedInPrior = "incorporated_in_prior"
}

public struct ClearedInputs: Codable, Sendable, Equatable {
    public var coverage: Double
    public var sweepWidthM: Double?
    public var trackLengthM: Double?
    public var areaM2: Double
    public var rdBasis: RdBasis

    public init(coverage: Double, sweepWidthM: Double?, trackLengthM: Double?, areaM2: Double, rdBasis: RdBasis) {
        self.coverage = coverage
        self.sweepWidthM = sweepWidthM
        self.trackLengthM = trackLengthM
        self.areaM2 = areaM2
        self.rdBasis = rdBasis
    }

    enum CodingKeys: String, CodingKey { case coverage, sweepWidthM, trackLengthM, areaM2, rdBasis }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(coverage, forKey: .coverage)
        try c.encode(sweepWidthM, forKey: .sweepWidthM)     // explicit null: key sets are compared exactly
        try c.encode(trackLengthM, forKey: .trackLengthM)
        try c.encode(areaM2, forKey: .areaM2)
        try c.encode(rdBasis, forKey: .rdBasis)
    }
}

/// The stored result of an event. The device that creates the event computes it; every other
/// device applies it as stored and never re-derives it.
public enum Effect: Equatable, Sendable, Codable {
    case cleared(segmentId: String, pod: Double, inputs: ClearedInputs)
    case clue(influences: [String: Influence], authenticity: Authenticity)
    case none(why: NoneReason)

    public var clearedSegmentId: String? {
        if case let .cleared(segmentId, _, _) = self { return segmentId }
        return nil
    }

    public var pod: Double? {
        if case let .cleared(_, pod, _) = self { return pod }
        return nil
    }

    enum CodingKeys: String, CodingKey { case kind, segmentId, pod, inputs, influences, authenticity, why }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "cleared":
            self = .cleared(
                segmentId: try c.decode(String.self, forKey: .segmentId),
                pod: try c.decode(Double.self, forKey: .pod),
                inputs: try c.decode(ClearedInputs.self, forKey: .inputs)
            )
        case "clue":
            self = .clue(
                influences: try c.decode([String: Influence].self, forKey: .influences),
                authenticity: try c.decode(Authenticity.self, forKey: .authenticity)
            )
        case "none":
            self = .none(why: try c.decode(NoneReason.self, forKey: .why))
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unknown effect kind \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .cleared(segmentId, pod, inputs):
            try c.encode("cleared", forKey: .kind)
            try c.encode(segmentId, forKey: .segmentId)
            try c.encode(pod, forKey: .pod)
            try c.encode(inputs, forKey: .inputs)
        case let .clue(influences, authenticity):
            try c.encode("clue", forKey: .kind)
            try c.encode(influences, forKey: .influences)
            try c.encode(authenticity, forKey: .authenticity)
        case let .none(why):
            try c.encode("none", forKey: .kind)
            try c.encode(why, forKey: .why)
        }
    }
}
