import Foundation
import Testing
@testable import PLSCore

@Suite struct ModelProfileTests {
    let shared: JSONValue = .object([
        "answersTo": .string("Dot"), "ageYears": .number(81), "appearance": .string("small, white hair in a bun"),
        "heightFt": .number(5), "heightIn": .number(2), "weightLb": .number(110), "hair": .string("white"),
        "clothingLastWorn": .string("blue robe, pink slippers"), "mobilityAids": .array([.string("cane")]),
        "dementiaType": .string("lewy_body"), "flags": .object(["likelyToHide": .bool(true), "seizures": .bool(true)]),
        "bestApproach": .string("speak softly"), "triggersToAvoid": .string("uniforms")
    ])

    @Test func onlyTheSixAppearanceFieldsReachAModel() throws {
        let p = ModelProfile(shared: shared)
        guard case let .object(o) = try JSONValue(encoding: p) else { Issue.record("not an object"); return }
        #expect(Set(o.keys) == ["clothingLastWorn", "appearance", "heightFt", "heightIn", "hair", "mobilityAids"])
    }

    @Test func theToolTextHoldsNoHealthOrBehaviourWords() {
        let text = ModelProfile(shared: shared).toolText
        #expect(text.contains("blue robe, pink slippers"))
        #expect(text.contains("5 ft 2 in"))
        #expect(text.contains("cane"))
        for banned in ["lewy", "seizure", "hide", "uniform", "softly", "Dot", "81", "110"] {
            #expect(!text.lowercased().contains(banned.lowercased()), "\(banned)")
        }
    }

    @Test func anEmptyProfileSaysSo() {
        #expect(ModelProfile(shared: .object([:])).toolText == "No description on file.")
        #expect(ModelProfile(shared: .null).toolText == "No description on file.")
    }
}
