import Foundation

/// The only part of the subject profile any model may see (spec section 13.2,
/// profileForModel): clothing and appearance. Health and behaviour fields, names, age and
/// weight never reach a model; on the cloud route a tool's output leaves the phone.
public struct ModelProfile: Codable, Sendable, Equatable {
    public var clothingLastWorn: String?
    public var appearance: String?
    public var heightFt: Int?
    public var heightIn: Int?
    public var hair: String?
    public var mobilityAids: [String]?

    /// Picks the six fields from a `profile/shared` document and ignores everything else.
    public init(shared: JSONValue) {
        func string(_ k: String) -> String? { if case let .string(s)? = shared[k], !s.isEmpty { s } else { nil } }
        func int(_ k: String) -> Int? { if case let .number(n)? = shared[k] { Int(exactly: n.rounded()) } else { nil } }
        clothingLastWorn = string("clothingLastWorn")
        appearance = string("appearance")
        heightFt = int("heightFt")
        heightIn = int("heightIn")
        hair = string("hair")
        if case let .array(a)? = shared["mobilityAids"] {
            let aids = a.compactMap { if case let .string(s) = $0 { s } else { nil } }
            mobilityAids = aids.isEmpty ? nil : aids
        }
    }

    enum CodingKeys: String, CodingKey { case clothingLastWorn, appearance, heightFt, heightIn, hair, mobilityAids }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(clothingLastWorn, forKey: .clothingLastWorn)
        try c.encode(appearance, forKey: .appearance)
        try c.encode(heightFt, forKey: .heightFt)
        try c.encode(heightIn, forKey: .heightIn)
        try c.encode(hair, forKey: .hair)
        try c.encode(mobilityAids, forKey: .mobilityAids)
    }

    /// What `SubjectProfileTool` returns to the model.
    public var toolText: String {
        var lines: [String] = []
        if let clothingLastWorn { lines.append("Clothing last worn: \(clothingLastWorn).") }
        if let appearance { lines.append("Appearance: \(appearance).") }
        if let heightFt { lines.append("Height: \(heightFt) ft \(heightIn ?? 0) in.") }
        if let hair { lines.append("Hair: \(hair).") }
        if let mobilityAids { lines.append("Mobility aids: \(mobilityAids.joined(separator: ", ")).") }
        return lines.isEmpty ? "No description on file." : lines.joined(separator: " ")
    }
}
