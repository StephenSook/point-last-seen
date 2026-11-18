import Testing
@testable import PLSCore

@Suite struct PhoneNumbersTests {
    @Test func commonShapesAreRemoved() {
        for text in ["404-555-0123", "(404) 555-0123", "404 555 0123", "404.555.0123", "+1 404 555 0123", "+44 20 7946 0958", "555-0123", "4045550123"] {
            #expect(PhoneNumbers.scrub("call \(text) now") == "call [number removed] now", "\(text)")
        }
    }

    @Test func unicodeAndFullWidthDigitsAreRemoved() {
        #expect(PhoneNumbers.scrub("call \u{0664}\u{0660}\u{0664}\u{0665}\u{0665}\u{0665}\u{0660}\u{0661}\u{0662}\u{0663}") == "call [number removed]")
        #expect(PhoneNumbers.scrub("call \u{FF14}\u{FF10}\u{FF14}\u{FF15}\u{FF15}\u{FF15}\u{FF10}\u{FF11}\u{FF12}\u{FF13}") == "call [number removed]")
    }

    @Test func spokenDigitRunsAreRemoved() {
        #expect(PhoneNumbers.scrub("his number is four oh four five five five zero one two three ok") == "his number is [number removed] ok")
    }

    @Test func reportNumbersStay() {
        let t = "cleared AC, coverage 0.8, 45 minutes, 3 searchers, forty five minutes, point eight"
        #expect(PhoneNumbers.scrub(t) == t)
    }

    @Test func everyStringInTheStoredReadingIsScrubbed() {
        var r = reading(kind: .clue, evidenceQuote: "found a hat")
        r.item = "hat 404-555-0123"; r.footwear = "boot 555-0123"; r.carried = "phone 4045550123"
        let j = PhoneNumbers.scrub(json: try! JSONValue(encoding: r))
        #expect(j["item"] == .string("hat [number removed]"))
        #expect(j["footwear"] == .string("boot [number removed]"))
        #expect(j["carried"] == .string("phone [number removed]"))
        #expect(j["kind"] == .string("clue"))
    }
}
