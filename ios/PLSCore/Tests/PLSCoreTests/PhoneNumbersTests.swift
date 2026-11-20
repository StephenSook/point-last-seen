import Foundation
import Testing
@testable import PLSCore

@Suite struct PhoneNumbersTests {
    /// A date is search information (when someone was last seen), not a phone number, in any of the
    /// common written forms; a number written next to a date is still removed.
    @Test func datesStay() {
        for text in ["11/19/2026", "2026-11-19", "11/19", "Nov 19", "11-19-2026", "19.11.2026", "1/2/2026", "11/19/26",
                     "Last seen 11/19/2026 at 14:03 in segment 12"] {
            #expect(PhoneNumbers.scrub(text) == text, "\(text)")
        }
        #expect(PhoneNumbers.scrub("Seen 2026-11-19, call 404 555 0142 now") == "Seen 2026-11-19, call [number removed] now")
        #expect(PhoneNumbers.scrub("Seen 11/19/2026 404/555/0142") == "Seen 11/19/2026 [number removed]")
    }

    /// Chinese numeral digits are digits, and a pasted line break (CRLF) is one separator.
    @Test func chineseDigitsAndPastedLineBreaksAreCaught() {
        #expect(PhoneNumbers.scrub("Call \u{56db}\u{96f6}\u{56db}\u{4e94}\u{4e94}\u{4e94}\u{96f6}\u{4e00}\u{56db}\u{4e8c}") == "Call [number removed]")
        // The line break is kept (each line gets its own mark), so two lines never become one.
        #expect(PhoneNumbers.scrub("Call 404-555\r\n  0142") == "Call [number removed]\n[number removed]")
    }

    /// Dashes other than the plain hyphen (non-breaking, hyphen, en, minus) join a number's parts too.
    @Test func unicodeDashesJoinANumber() {
        for dash in ["\u{2010}", "\u{2011}", "\u{2012}", "\u{2013}", "\u{2014}", "\u{2212}"] {
            #expect(PhoneNumbers.scrub("Call 404\(dash)555\(dash)0142") == "Call [number removed]", "\(dash.unicodeScalars.first!.value)")
        }
    }

    /// A date carved out of a longer run is not a date: "06.12.20" inside a dotted number, or "2026-11-19"
    /// after a US number's first groups. A date beside a whole number of its own stays, and the number goes.
    @Test func aDateNeverShieldsPartOfANumber() {
        #expect(PhoneNumbers.scrub("Call 06.12.20.26.19") == "Call [number removed]")
        #expect(PhoneNumbers.scrub("Call 404-555-2026-11-19") == "Call [number removed]")
        #expect(PhoneNumbers.scrub("Seen 11/19/2026 404-555-0142") == "Seen 11/19/2026 [number removed]")
        #expect(PhoneNumbers.scrub("Seen 11/19/2026, call 404-555-0142") == "Seen 11/19/2026, call [number removed]")
    }

    /// Search information made of digits stays: coordinates, ordinals and units, grouped counts, ZIP+4.
    @Test func coordinatesOrdinalsUnitsCountsAndZipCodesStay() {
        for text in ["GPS 33.7490, -84.3880", "GPS 33.7490 -84.3880", "12345 67th Ave and 12345 68th Ave", "walked 1,234,567 steps",
                     "about 2 5km loops", "Atlanta, GA 30301-1234"] {
            #expect(PhoneNumbers.scrub(text) == text, "\(text)")
        }
    }

    /// A time or a month-name date beside a number stays; only the number goes.
    @Test func aTimeOrMonthDateBesideANumberStays() {
        #expect(PhoneNumbers.scrub("Seen at 14:03, 404-555-0142") == "Seen at 14:03, [number removed]")
        #expect(PhoneNumbers.scrub("Nov 19 2026 404-555-0142") == "Nov 19 2026 [number removed]")
        #expect(PhoneNumbers.scrub("19 November 2026, 404-555-0142") == "19 November 2026, [number removed]")
    }

    /// Spoken digits in capitals are caught whatever the phone's language (casing is not the device's).
    @Test func spokenDigitsInCapitalsAreCaught() {
        #expect(PhoneNumbers.scrub("call FOUR OH FOUR FIVE FIVE FIVE OH ONE FOUR TWO") == "call [number removed]")
    }

    /// A phone number written up against something shaped like search information still goes: nothing of it is left.
    @Test func aNumberShapedLikeSearchInformationStillGoes() {
        let cases: [(String, [String])] = [
            ("404.5550142, -84.3880", ["5550142", "404"]), ("Call 1,404,555,0142", ["0142", "555"]),
            ("Call 91234-5678", ["91234", "5678"]), ("May 4 2026-555-142", ["555", "142"]), ("Call 404-555-19 May", ["404", "555"]),
            ("Call 404-555-01:42", ["404", "555"]), ("call 404-555-0142m", ["404", "0142"]), ("Call 1-404-555-2026-11-19", ["404", "555"]),
            ("call 555.1234, 555.6789", ["1234", "6789"]),
        ]
        for (input, gone) in cases {
            let out = PhoneNumbers.scrub(input)
            for g in gone { #expect(!out.contains(g), "\(input) -> \(out)") }
        }
        #expect(PhoneNumbers.scrub("\u{7535}\u{8bdd}\u{56db}\u{96f6}\u{56db}\u{4e94}\u{4e94}\u{4e94}\u{96f6}\u{4e00}\u{56db}\u{4e8c}")
            == "\u{7535}\u{8bdd}[number removed]")
    }

    /// A date written with en dashes stays; a ZIP after a state stays beside a number.
    @Test func datesAndAddressedZipCodesStay() {
        #expect(PhoneNumbers.scrub("Seen 2026\u{2013}11\u{2013}19") == "Seen 2026\u{2013}11\u{2013}19")
        #expect(PhoneNumbers.scrub("Atlanta, GA 30301-1234 404-555-0142") == "Atlanta, GA 30301-1234 [number removed]")
    }

    /// A short number touching a written date could be part of a number, so the whole run goes (the date is lost
    /// with it). A 5-4 number with no state before it goes.
    @Test func aShortNumberTouchingADateTakesTheDateWithItAndAnUnaddressedFiveFourNumberGoes() {
        for text in ["team 5 11/19/2026", "zone 2 2026-11-19", "route 66 11/19/2026", "room 1204 11/19/2026", "Seen 11/19/2026, 3 miles north"] {
            #expect(!PhoneNumbers.scrub(text).contains { $0.isASCII && $0.isNumber }, "\(text) -> \(PhoneNumbers.scrub(text))")
        }
        #expect(PhoneNumbers.scrub("call 40455-0142") == "call [number removed]")
        #expect(PhoneNumbers.scrub("call 08001-1234") == "call [number removed]")
        #expect(PhoneNumbers.scrub("call 404-555-0142ft") == "call [number removed]ft")
    }

    /// A search span with a short piece of digits beside it takes the whole run with it.
    @Test func aSpanBesideAShortPieceTakesTheWholeRun() {
        let cases: [(String, [String])] = [
            ("Call GA 40455-5014 2", ["40455", "5014"]), ("Call 404,555,014 two", ["404", "014", "two"]),
            ("Call 4.0455 5.0142", ["0455", "0142"]), ("Call Nov 20 1955 0142", ["1955", "0142"]),
            ("Call four zero four five five five 0142ft", ["four", "0142"]), ("Call 404 5-15-2026", ["404", "2026"]),
            ("Call 25/12/26-9-1-26", ["25/12", "9-1"]), ("call 555 0142m", ["555", "0142"]), ("Call 06.12.20-26-19", ["06.12", "26-19"]),
            ("Call 404-555-2026/11/19", ["404", "555"]), ("Call 404.555.2026-11-19", ["404", "555"]), ("Meet in Atlanta, ga 30301-1234", ["30301"]),
        ]
        for (input, gone) in cases {
            let out = PhoneNumbers.scrub(input)
            for g in gone { #expect(!out.contains(g), "\(input) -> \(out)") }
        }
    }

    /// Search information beside a whole number stays, and only the number goes.
    @Test func searchInformationBesideAWholeNumberStays() {
        #expect(PhoneNumbers.scrub("Seen 11/19/2026 14:03 404-555-0142") == "Seen 11/19/2026 14:03 [number removed]")
        #expect(PhoneNumbers.scrub("GA 30301-1234 555 0142") == "GA 30301-1234 [number removed]")
        #expect(PhoneNumbers.scrub("14:03 five five five zero one four two") == "14:03 [number removed]")
        #expect(PhoneNumbers.scrub("1,234,567 555 0142") == "1,234,567 [number removed]")
    }

    /// A removed run keeps its line breaks, so two lines never become one.
    @Test func aRemovedRunKeepsItsLineBreaks() {
        #expect(PhoneNumbers.scrub("Trail marker 1234\n5678 Oak Road") == "Trail marker [number removed]\n[number removed] Oak Road")
    }

    /// A unit on a whole number, overlapping dates, an indented line break, "triple five".
    @Test func unitsOverlappingDatesIndentedBreaksAndRepeatsGo() {
        #expect(PhoneNumbers.scrub("Call 4045550142pm") == "Call [number removed]pm")
        let cases: [(String, [String])] = [
            ("Call 06.12.20-06-19", ["06.12", "06-19"]), ("Call +1 (404) 555-\n    0142", ["404", "0142"]),
            ("Call +1 (404) 555-\r0142", ["404", "0142"]), ("Call four oh four, triple five, zero one four two", ["four", "triple", "zero"]),
            ("Call double four zero four five five five one four two", ["double", "five"]),
        ]
        for (input, gone) in cases {
            let out = PhoneNumbers.scrub(input)
            for g in gone { #expect(!out.contains(g), "\(input) -> \(out)") }
        }
    }

    /// Digit groups that only look like a date are still numbers: no month 13, no year 5551.
    @Test func numbersShapedLikeDatesAreStillRemoved() {
        for text in ["404/555/0142", "13/45/2026", "5551-12-34", "404-555-0142"] {
            #expect(PhoneNumbers.scrub("call \(text) now") == "call [number removed] now", "\(text)")
        }
    }

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
    struct Remove: Decodable { var name: String; var input: String; var number: String; var forbidden: [String]; var keep: [String]; var pendingOn: [String]? }
    struct Keep: Decodable { var name: String; var input: String; var pendingOn: [String]? }
    struct Exact: Decodable { var name: String; var input: String; var output: String; var pendingOn: [String]? }
    struct File: Decodable {
        var schemaVersion: Int
        var replacement: String?
        var mustRemove: [Remove]
        var mustKeep: [Keep]
        var exact: [Exact]?
    }

    /// The kinds of case the iPhone runs, each with the keys its cases may carry.
    static let kinds: [String: Set<String>] = [
        "mustRemove": ["name", "input", "number", "forbidden", "keep", "pendingOn"],
        "mustKeep": ["name", "input", "pendingOn"],
        "exact": ["name", "input", "output", "pendingOn"],
    ]

    static func isNumber(_ s: Unicode.Scalar) -> Bool {
        switch s.properties.generalCategory {
        case .decimalNumber, .letterNumber, .otherNumber: true
        default: false
        }
    }

    /// A case marked pending on the iPhone is skipped here (the contract); every other case runs.
    static func runsHere(_ pendingOn: [String]?) -> Bool { !(pendingOn ?? []).contains("ios") }

    func data() throws -> Data { try Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("test-vectors/phone-numbers.json")) }
    func file() throws -> File { try JSONDecoder().decode(File.self, from: data()) }

    @Test func theFileHasCasesOfBothKinds() throws {
        let f = try file()
        #expect(f.schemaVersion == 1 && f.mustRemove.count >= 7 && f.mustKeep.count >= 5)
    }

    /// The token the file expects is the one this phone writes.
    @Test func theReplacementIsTheOneThisPhoneWrites() throws {
        if let replacement = try file().replacement { #expect(replacement == PhoneNumbers.replacement) }
    }

    /// Every kind of case in the file, and every key on a case, is run here: a new kind or key fails this
    /// test until the iPhone runs it, so no case is skipped in silence.
    @Test func everyKindOfCaseInTheFileIsRun() throws {
        let root = try JSONSerialization.jsonObject(with: data()) as? [String: Any] ?? [:]
        let known: Set<String> = Set(Self.kinds.keys).union(["schemaVersion", "note", "replacement"])
        #expect(Set(root.keys).isSubset(of: known), "\(root.keys.sorted())")
        for (kind, allowed) in Self.kinds {
            for c in root[kind] as? [[String: Any]] ?? [] {
                #expect(Set(c.keys).isSubset(of: allowed), "\(kind): \(c.keys.sorted())")
            }
        }
    }

    @Test func everyNumberIsRemovedAndTheTextAroundItStays() throws {
        for c in try file().mustRemove where Self.runsHere(c.pendingOn) {
            let out = PhoneNumbers.scrub(c.input)
            #expect(!out.contains(c.number), "\(c.name): \(out)")
            // No number character of any script is left (Unicode Nd, Nl, No), not only 0 to 9.
            #expect(!out.unicodeScalars.contains(where: Self.isNumber), "\(c.name): \(out)")
            for word in c.forbidden { #expect(!out.lowercased().contains(word.lowercased()), "\(c.name): \(word) in \(out)") }
            for part in c.keep { #expect(out.contains(part), "\(c.name): \(part) missing from \(out)") }
        }
    }

    @Test func timesSegmentsCountsAndPercentsStayExactly() throws {
        for c in try file().mustKeep where Self.runsHere(c.pendingOn) {
            #expect(PhoneNumbers.scrub(c.input) == c.input, "\(c.name)")
        }
    }

    /// An exact case's output is compared byte for byte, not by Unicode equivalence.
    @Test func exactCasesMatchByteForByte() throws {
        for c in try file().exact ?? [] where Self.runsHere(c.pendingOn) {
            let out = PhoneNumbers.scrub(c.input)
            #expect(Array(out.utf8) == Array(c.output.utf8), "\(c.name): \(out)")
        }
    }
}
