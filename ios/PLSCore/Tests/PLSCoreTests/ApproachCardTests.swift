import Foundation
import Testing
@testable import PLSCore

@Suite struct ApproachCardTests {
    @Test func notesFollowTheFileOrderWithTheFamilyWordsFilledIn() throws {
        let notes = try ApproachNotes(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/approach-notes.json")))
        let profile = try sharedProfileJSON(ids: ["unique", "may_not_respond", "seizures", "approach_calm", "language", "likely_to_hide", "no_such_note"]).decode(SharedProfile.self)
        let card = ApproachCard.build(profile: profile, notes: notes)
        #expect(card.first.map(\.id) == ["may_not_respond", "approach_calm", "likely_to_hide", "seizures", "language", "unique"])
        #expect(card.first.first { $0.id == "language" }?.text == "Primary language: Spanish.")
        #expect(card.first.first { $0.id == "unique" }?.text == "Walks with a slight stoop")
        #expect(card.first.first { $0.id == "unique" }?.sourceRole == "family")
        #expect(card.more.isEmpty)
        #expect(card.footer == "General guidance from dementia care practitioners and search teams. Not medical advice.")
    }

    @Test func onlySevenGoOnTheFirstScreenAndEmptyFamilyTextIsSkipped() throws {
        let notes = try ApproachNotes(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/approach-notes.json")))
        let ids = ["may_not_respond", "approach_calm", "likely_to_hide", "afraid_of_uniforms", "looking_for_home", "freezing", "fall_risk", "soft_voice", "fluctuates", "unique", "triggers"]
        let card = ApproachCard.build(profile: try sharedProfileJSON(ids: ids, unique: "").decode(SharedProfile.self), notes: notes)
        #expect(card.first.count == 7)
        #expect(card.more.map(\.id) == ["soft_voice", "fluctuates"])                 // triggers and unique are empty
    }
}
