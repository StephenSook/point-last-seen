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

    /// A phone number typed into a description field never reaches a model with it.
    @Test func aPhoneNumberInADescriptionNeverReachesAModel() {
        let p = ModelProfile(shared: .object(["appearance": .string("tall, call her son on 404 555 0123"),
                                              "clothingLastWorn": .string("blue robe, tag reads 4045550123"),
                                              "hair": .string("white")]))
        #expect(!p.toolText.contains("555") && p.toolText.contains(PhoneNumbers.replacement) && p.toolText.contains("blue robe"))
    }

    @Test func anEmptyProfileSaysSo() {
        #expect(ModelProfile(shared: .object([:])).toolText == "No description on file.")
        #expect(ModelProfile(shared: .null).toolText == "No description on file.")
    }
}
