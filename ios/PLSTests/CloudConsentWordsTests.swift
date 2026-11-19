import PLSCore
import Testing
@testable import PLS

/// The cloud switch says what leaves the phone and when, in the words the searcher reads.
@Suite struct CloudConsentWordsTests {
    @Test func theSwitchNamesWhatLeavesAndWhen() {
        #expect(ReadyCheckView.cloudLabel == "Allow cloud reading")
        #expect(ReadyCheckView.cloudDetail ==
            "Only when this phone cannot read a report. Google's model then gets the report's words (phone numbers removed), "
            + "the segment you are in, your team's segments, and the person's description: clothing, appearance, height, hair "
            + "and mobility aids.")
    }

    /// The description it names is exactly what the profile tool sends.
    @Test func theNamedDescriptionIsWhatTheModelGets() {
        let p = ModelProfile(shared: .object(["clothingLastWorn": .string("c"), "appearance": .string("a"), "heightFt": .number(5),
                                              "heightIn": .number(2), "hair": .string("h"), "mobilityAids": .array([.string("m")])]))
        #expect(p.toolText == "Clothing last worn: c. Appearance: a. Height: 5 ft 2 in. Hair: h. Mobility aids: m.")
    }
}
