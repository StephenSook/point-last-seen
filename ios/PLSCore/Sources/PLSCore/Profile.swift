import Foundation

/// `profile/shared`: the fields every member reads (spec section 13.2). Shown to people, carried
/// in the pack; only the six appearance fields in `ModelProfile` ever reach a model.
public struct SharedProfile: Codable, Sendable, Equatable {
    public var answersTo: String
    /// Mirrors `otherNames[0]` when the list is present ("" for an empty list), so older readers still show one.
    public var nickname: String
    /// Other names she may answer to, 0 to 5, each 1 to 60 characters, in the family's order.
    /// Absent (nil) on profiles saved before the list.
    public var otherNames: [String]?
    public var ageYears: Int?
    public var gender: String
    public var appearance: String
    public var heightFt: Int?
    public var heightIn: Int?
    public var weightLb: Int?
    public var hair: String
    public var eyeColor: String
    public var primaryLanguage: String
    public var clothingLastWorn: String
    public var mobilityAids: [String]
    public var dementiaType: String?
    public var flags: [String: Bool]
    public var triggersToAvoid: String
    public var bestApproach: String
    public var uniqueDescription: String
    public var photoTakenOn: String?
    public var approachNoteIds: [String]

    enum CodingKeys: String, CodingKey {
        case answersTo, nickname, otherNames, ageYears, gender, appearance, heightFt, heightIn, weightLb, hair, eyeColor, primaryLanguage,
             clothingLastWorn, mobilityAids, dementiaType, flags, triggersToAvoid, bestApproach, uniqueDescription, photoTakenOn,
             approachNoteIds
    }

    /// The rules let command write the document in parts, so every missing (or null) key reads
    /// as empty: "" for text, [] for lists, [:] for flags, nil for the optional values.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func text(_ k: CodingKeys) throws -> String { try c.decodeIfPresent(String.self, forKey: k) ?? "" }
        answersTo = try text(.answersTo)
        nickname = try text(.nickname)
        otherNames = try c.decodeIfPresent([String].self, forKey: .otherNames)
        ageYears = try c.decodeIfPresent(Int.self, forKey: .ageYears)
        gender = try text(.gender)
        appearance = try text(.appearance)
        heightFt = try c.decodeIfPresent(Int.self, forKey: .heightFt)
        heightIn = try c.decodeIfPresent(Int.self, forKey: .heightIn)
        weightLb = try c.decodeIfPresent(Int.self, forKey: .weightLb)
        hair = try text(.hair)
        eyeColor = try text(.eyeColor)
        primaryLanguage = try text(.primaryLanguage)
        clothingLastWorn = try text(.clothingLastWorn)
        mobilityAids = try c.decodeIfPresent([String].self, forKey: .mobilityAids) ?? []
        dementiaType = try c.decodeIfPresent(String.self, forKey: .dementiaType)
        flags = try c.decodeIfPresent([String: Bool].self, forKey: .flags) ?? [:]
        triggersToAvoid = try text(.triggersToAvoid)
        bestApproach = try text(.bestApproach)
        uniqueDescription = try text(.uniqueDescription)
        photoTakenOn = try c.decodeIfPresent(String.self, forKey: .photoTakenOn)
        approachNoteIds = try c.decodeIfPresent([String].self, forKey: .approachNoteIds) ?? []
    }

    /// All 20 keys, nulls written out (the schema allows no other keys), plus `otherNames` only
    /// when the profile has the list.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(answersTo, forKey: .answersTo)
        try c.encode(nickname, forKey: .nickname)
        try c.encodeIfPresent(otherNames, forKey: .otherNames)
        try c.encode(ageYears, forKey: .ageYears)
        try c.encode(gender, forKey: .gender)
        try c.encode(appearance, forKey: .appearance)
        try c.encode(heightFt, forKey: .heightFt)
        try c.encode(heightIn, forKey: .heightIn)
        try c.encode(weightLb, forKey: .weightLb)
        try c.encode(hair, forKey: .hair)
        try c.encode(eyeColor, forKey: .eyeColor)
        try c.encode(primaryLanguage, forKey: .primaryLanguage)
        try c.encode(clothingLastWorn, forKey: .clothingLastWorn)
        try c.encode(mobilityAids, forKey: .mobilityAids)
        try c.encode(dementiaType, forKey: .dementiaType)
        try c.encode(flags, forKey: .flags)
        try c.encode(triggersToAvoid, forKey: .triggersToAvoid)
        try c.encode(bestApproach, forKey: .bestApproach)
        try c.encode(uniqueDescription, forKey: .uniqueDescription)
        try c.encode(photoTakenOn, forKey: .photoTakenOn)
        try c.encode(approachNoteIds, forKey: .approachNoteIds)
    }

    /// The names to call her by: the other-names list when present, else the nickname; blank names
    /// are left out (the TS engine's namesToCall).
    public var namesToCall: [String] {
        let has = { (s: String) in !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if let otherNames { return otherNames.filter(has) }
        return has(nickname) ? [nickname] : []
    }
}
