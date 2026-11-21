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
}
