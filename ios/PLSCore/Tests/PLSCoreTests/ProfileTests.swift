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


    /// Other names she may answer to: absent on documents saved before the list, kept in the
    /// family's order when present. The names to call read the list first, then the nickname
    /// (the TS engine's namesToCall, same four cases).
    @Test func otherNamesAreReadFirstAndTheNicknameOtherwise() throws {
        func profile(_ extra: [String: JSONValue]) throws -> SharedProfile {
            guard case var .object(o) = sharedProfileJSON(ids: []) else { throw CocoaError(.coderInvalidValue) }
            for (k, v) in extra { o[k] = v }
            return try JSONValue.object(o).decode(SharedProfile.self)
        }
        let listed = try profile(["nickname": .string("Mom"), "otherNames": .array([.string("Mom"), .string("Peggy")])])
        #expect(listed.otherNames == ["Mom", "Peggy"] && listed.namesToCall == ["Mom", "Peggy"])
        let older = try profile(["nickname": .string("Peggy")])
        #expect(older.otherNames == nil && older.namesToCall == ["Peggy"])
        #expect(try profile(["nickname": .string(""), "otherNames": .array([])]).namesToCall == [])
        #expect(try profile(["nickname": .string("  ")]).namesToCall == [])
        // Written back as read: the list when there is one, no key when there is none.
        guard case let .object(written) = try JSONValue(encoding: listed), case let .object(writtenOlder) = try JSONValue(encoding: older) else {
            Issue.record("encode"); return
        }
        #expect(written["otherNames"] == .array([.string("Mom"), .string("Peggy")]) && writtenOlder["otherNames"] == nil)
    }

    /// The rules let command write profile/shared in parts, so a nickname alone is a legal document.
    @Test func aNicknameOnlyDocumentDecodesWithEverythingElseEmpty() throws {
        let p = try JSONDecoder().decode(SharedProfile.self, from: Data(#"{"nickname":"Dottie"}"#.utf8))
        #expect(p.nickname == "Dottie")
        #expect(p.answersTo == "" && p.mobilityAids.isEmpty && p.flags.isEmpty && p.approachNoteIds.isEmpty)
        #expect(p.ageYears == nil && p.dementiaType == nil && p.photoTakenOn == nil)
        let notes = try ApproachNotes(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/approach-notes.json")))
        let card = ApproachCard.build(profile: p, notes: notes)
        #expect(card.first.isEmpty && card.more.isEmpty && !card.footer.isEmpty)
        #expect(ModelProfile(shared: .object(["nickname": .string("Dottie")])).toolText == "No description on file.")
    }
}

