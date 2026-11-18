import Foundation
import Testing
@testable import PLSCore

/// A schema-valid `profile/shared` document for tests.
func sharedProfileJSON(ids: [String], language: String = "Spanish", unique: String = "Walks with a slight stoop") -> JSONValue {
        .object([
        "answersTo": .string("Dot"), "nickname": .string(""), "ageYears": .number(81), "gender": .string("woman"),
        "appearance": .string("small, white hair in a bun"), "heightFt": .number(5), "heightIn": .number(2), "weightLb": .null,
        "hair": .string("white"), "eyeColor": .string("blue"), "primaryLanguage": .string(language),
        "clothingLastWorn": .string("blue robe"), "mobilityAids": .array([.string("cane")]), "dementiaType": .string("lewy_body"),
        "flags": .object(["mayNotRespond": .bool(true), "likelyToHide": .bool(true)]), "triggersToAvoid": .string(""),
        "bestApproach": .string(""), "uniqueDescription": .string(unique), "photoTakenOn": .string("2026-10-01"),
        "approachNoteIds": .array(ids.map(JSONValue.string))
    ])
}

@Suite struct ProfileTests {
    @Test func theSharedProfileDecodesAndKeepsExactlyTheSchemaKeys() throws {
        let p = try sharedProfileJSON(ids: []).decode(SharedProfile.self)
        #expect(p.answersTo == "Dot")
        #expect(p.flags["likelyToHide"] == true)
        let schema = try VectorFile.json("schemas/subject-profile.schema.json")
        guard case let .array(required)? = schema["$defs"]?["SharedProfile"]?["required"],
              case let .object(o) = try JSONValue(encoding: p) else { Issue.record("setup"); return }
        #expect(Set(o.keys) == Set(required.compactMap { if case let .string(k) = $0 { k } else { nil } }))
    }

}
