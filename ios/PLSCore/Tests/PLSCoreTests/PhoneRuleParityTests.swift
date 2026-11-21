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

    /// The shared rule reads the note by code point too, so a mark glued to a word or a digit, a letter-number and the
    /// gap before a street word read as on the web: each of these kept digits the web removes.
    @Test(arguments: [
        ("Call one\u{034F} 4:04 15:55", "Call [number removed]"),
        ("Call triple\u{034F} 4:04 15:55", "Call [number removed]"),
        ("Call 4:04 15:55. Call\u{034F} 33.1234, -84.5678", "Call [number removed]. Call\u{034F} [number removed]"),
        ("Call 4:04 15:55 7th\u{0085}Ave", "Call 4:[number removed]th\u{0085}Ave"),
        ("Call \u{10140} 4:04 15:55", "Call [number removed]"),
    ])
    func theSharedRuleReadsByCodePoint(input: String, output: String) {
        #expect(same(input, output))
    }
}
