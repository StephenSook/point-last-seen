import Foundation

/// The urgency chip (P-12): search urgency only, never treatment advice. Its inputs are typed at
/// command: a temperature in °F and whether the person is wet. Clothing does not enter.
public enum UrgencyLevel: String, Sendable, Equatable {
    case cold
    case coolWet = "cool_wet"
    case none

    public var chipText: String? {
        switch self {
        case .cold: return "Cold raises urgency"
        case .coolWet: return "Cool and wet raises urgency"
        case .none: return nil
        }
    }
}

/// `shared/constants/urgency.json`: the threshold and its source, the same file web reads.
public struct UrgencyRule: Sendable, Equatable {
    public var coldF: Double
    public var sourceUrl: String
    public var quote: String
    public var readOn: String

    struct File: Decodable { let coldF: Double; let sourceUrl: String; let quote: String; let readOn: String }

    public init(json: Data) throws {
        let f = try JSONDecoder().decode(File.self, from: json)
        coldF = f.coldF
        sourceUrl = f.sourceUrl
        quote = f.quote
        readOn = f.readOn
    }

    /// Cold at or below the threshold; cool and wet above it when the person is typed as wet; no
    /// chip with no temperature, an unanswered wet question, or a value that is not a number.
    public func level(tempF: Double?, wet: Bool?) -> UrgencyLevel {
        guard let tempF, tempF.isFinite else { return .none }
        if tempF <= coldF { return .cold }
        return wet == true ? .coolWet : .none
    }

    /// The chip's source line: the CDC sentence word for word, with the date it was read.
    public var sourceLine: String { "CDC: \"\(quote)\" (read \(readOn))" }
}
