import Foundation

/// `profile/shared`: the fields every member reads (spec section 13.2). Shown to people, carried
/// in the pack; only the six appearance fields in `ModelProfile` ever reach a model.
public struct SharedProfile: Codable, Sendable, Equatable {
    public var answersTo: String
    public var nickname: String
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
        case answersTo, nickname, ageYears, gender, appearance, heightFt, heightIn, weightLb, hair, eyeColor, primaryLanguage,
             clothingLastWorn, mobilityAids, dementiaType, flags, triggersToAvoid, bestApproach, uniqueDescription, photoTakenOn,
             approachNoteIds
    }

    /// All 20 keys, nulls written out (the schema allows no other keys).
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(answersTo, forKey: .answersTo)
        try c.encode(nickname, forKey: .nickname)
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
}
