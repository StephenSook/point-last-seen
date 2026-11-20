import Foundation
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

    /// Dictation mixes written digits and spoken ones; together they are still one number.
    @Test func mixedWrittenAndSpokenDigitsAreRemoved() {
        for text in ["404 five five five 0123", "four oh four 555 0123", "4 0 4 five five five zero 1 2 3", "five five five, 0123"] {
            #expect(PhoneNumbers.scrub("call \(text) now") == "call [number removed] now", "\(text)")
        }
        // Short mixed numbers in a report stay.
        let t = "2 searchers, five minutes, segment 12, one hour"
        #expect(PhoneNumbers.scrub(t) == t)
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

/// Runs every case of shared/test-vectors/phone-numbers.json, the phone-number cases every platform
/// that removes numbers from a note must pass (contract: shared/test-vectors/README.md).
@Suite struct PhoneNumberVectorTests {
    struct Remove: Decodable { var name: String; var input: String; var number: String; var forbidden: [String]; var keep: [String] }
    struct Keep: Decodable { var name: String; var input: String }
    struct File: Decodable { var schemaVersion: Int; var mustRemove: [Remove]; var mustKeep: [Keep] }

    func file() throws -> File {
        try JSONDecoder().decode(File.self, from: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("test-vectors/phone-numbers.json")))
    }

    @Test func theFileHasCasesOfBothKinds() throws {
        let f = try file()
        #expect(f.schemaVersion == 1 && f.mustRemove.count >= 7 && f.mustKeep.count >= 5)
    }

    @Test func everyNumberIsRemovedAndTheTextAroundItStays() throws {
        for c in try file().mustRemove {
            let out = PhoneNumbers.scrub(c.input)
            #expect(!out.contains(c.number), "\(c.name): \(out)")
            #expect(!out.contains { $0.isASCII && $0.isNumber }, "\(c.name): \(out)")
            for word in c.forbidden { #expect(!out.lowercased().contains(word.lowercased()), "\(c.name): \(word) in \(out)") }
            for part in c.keep { #expect(out.contains(part), "\(c.name): \(part) missing from \(out)") }
        }
    }

    @Test func timesSegmentsCountsAndPercentsStayExactly() throws {
        for c in try file().mustKeep {
            #expect(PhoneNumbers.scrub(c.input) == c.input, "\(c.name)")
        }
    }
}
