import Testing
@testable import PLSCore

/// Cases where the iPhone's phone rule read a note differently from the web and Android rules, found by running the
/// web rule's fixed-seed corpus through it. Each is compared byte for byte.
@Suite struct PhoneRuleParityTests {
    func same(_ input: String, _ output: String) -> Bool { Array(PhoneNumbers.scrub(input).utf8) == Array(output.utf8) }

    /// A next line (U+0085), line separator or paragraph separator is a line break, like CR and LF: it joins the
    /// number's parts, and each line's part is replaced on its own line.
    @Test(arguments: ["\u{0085}", "\u{2028}", "\u{2029}"])
    func everyLineBreakIsALineBreak(br: String) {
        #expect(same("call 555\(br)1234 now", "call [number removed]\n[number removed] now"))
    }

    /// A format character (a zero-width space) between a phone cue and a decimal pair is read through, as the web
    /// reads every gap: the pair after the cue is a number, not a place.
    @Test func aFormatCharacterAfterACueIsReadThrough() {
        #expect(same("33.7866, -84.3733 n\u{00FA}mero \u{200B}33.7866, -84.3733 ",
                     "33.7866, -84.3733 n\u{00FA}mero \u{200B}[number removed] "))
    }
}
