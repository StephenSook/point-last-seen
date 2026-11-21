import Foundation
import Testing
@testable import PLSCore

/// A run of clock times is decided as a whole before the shared rule. In clock order with no phone cue before it, it
/// is search information and stays; out of order, or after a cue, it could be a number written as times and goes.
/// The cases are the shared vector file's cases for this rule (shared/test-vectors/phone-numbers.json), copied so the
/// port is proven before that file names them for the iPhone.
@Suite struct TimesRunTests {
    struct Cases: Decodable {
        var mustRemove: [PhoneNumberVectorTests.Remove]
        var mustKeep: [PhoneNumberVectorTests.Keep]
        var exact: [PhoneNumberVectorTests.Exact]
    }

    static let json = #"""
{
  "mustRemove": [
    {
      "name": "phone_cue_before_a_run_of_times",
      "input": "Call 21:25 5:50 1:42 tonight",
      "number": "21:25 5:50 1:42",
      "forbidden": [],
      "keep": [
        "Call",
        "tonight"
      ]
    },
    {
      "name": "phone_cue_before_a_run_of_times_with_commas",
      "input": "Call 21:25, 5:50, 1:42 tonight",
      "number": "21:25, 5:50, 1:42",
      "forbidden": [],
      "keep": [
        "Call",
        "tonight"
      ]
    },
    {
      "name": "times_out_of_clock_order",
      "input": "Try 12:12 5:55 01:42 tonight",
      "number": "12:12 5:55 01:42",
      "forbidden": [],
      "keep": [
        "Try",
        "tonight"
      ]
    },
    {
      "name": "phone_cue_before_times_written_as_a_number",
      "input": "Call 4:04 5:55 01:42 tonight",
      "number": "4:04 5:55 01:42",
      "forbidden": [],
      "keep": [
        "Call",
        "tonight"
      ]
    },
    {
      "name": "phone_cue_and_a_tab_before_a_run_of_times",
      "input": "Call\t4:04 5:55 16:42 tonight",
      "number": "4:04 5:55 16:42",
      "forbidden": [],
      "keep": [
        "Call",
        "tonight"
      ]
    },
    {
      "name": "phone_cue_a_few_words_before_a_run_of_times",
      "input": "Reach me at 4:04 5:55 06:42 tonight",
      "number": "4:04 5:55 06:42",
      "forbidden": [],
      "keep": [
        "Reach me at",
        "tonight"
      ]
    },
    {
      "name": "phone_cue_and_a_bracket_before_a_run_of_times",
      "input": "Call (4:04 5:55 16:43) tonight",
      "number": "4:04 5:55 16:43",
      "forbidden": [],
      "keep": [
        "Call (",
        ") tonight"
      ]
    },
    {
      "name": "phone_cue_and_a_spoken_digit_before_a_run_of_times",
      "input": "Call one: 4:04 5:55 6:42 tonight",
      "number": "4:04 5:55 6:42",
      "forbidden": [],
      "keep": [
        "Call one:",
        "tonight"
      ]
    }
  ],
  "mustKeep": [
    {
      "name": "times_run",
      "input": "The possible times are 14:03, 14:10, 14:17."
    }
  ],
  "exact": [
    {
      "name": "times_run_and_a_number",
      "input": "Times 14:03, 14:10, 14:17. Call 404 555 0142",
      "output": "Times 14:03, 14:10, 14:17. Call [number removed]"
    },
    {
      "name": "phone_cue_and_a_written_digit_before_a_run_of_times",
      "input": "Call 5 at 4:04 5:55 06:44 tonight",
      "output": "Call 5 at [number removed] tonight"
    },
    {
      "name": "spoken_digit_joined_to_a_run_of_times",
      "input": "Call four 4:04 5:55 6:42",
      "output": "Call [number removed]"
    }
  ]
}
"""#

    func cases() throws -> Cases { try JSONDecoder().decode(Cases.self, from: Data(Self.json.utf8)) }

    @Test func theSharedCasesForTheRulePass() throws {
        let c = try cases()
        #expect(c.mustRemove.count + c.mustKeep.count + c.exact.count == 12)
        for r in c.mustRemove { PhoneNumberVectorTests.checkRemoved(r) }
        for k in c.mustKeep { #expect(PhoneNumbers.scrub(k.input) == k.input, "\(k.name)") }
        for e in c.exact { #expect(Array(PhoneNumbers.scrub(e.input).utf8) == Array(e.output.utf8), "\(e.name)") }
    }

    /// The step reads the note by code point, as the web and Android rules do, so a mark or selector that a grapheme
    /// cluster would fold into a word or a digit never hides a cue or moves the run's end.
    @Test(arguments: [
        ("Call\u{034F} 4:04 15:55", "Call\u{034F} [number removed]"),
        ("Call 4:04 15:55\u{FE0F}", "Call [number removed]\u{FE0F}"),
        ("Code #\u{FE0F}\u{20E3}4:04 15:55", "Code #\u{FE0F}\u{20E3}[number removed]"),
    ])
    func marksAndSelectorsNeverHideACue(input: String, output: String) {
        #expect(Array(PhoneNumbers.scrub(input).utf8) == Array(output.utf8))
    }

    /// A "#" between the run and the words read before it is a cue too.
    @Test func aHashBeforeTheRunIsACue() {
        #expect(PhoneNumbers.scrub("Code #4:04 5:55 6:42 tonight") == "Code #[number removed] tonight")
        #expect(PhoneNumbers.scrub("Times 4:04 5:55 6:42 tonight") == "Times 4:04 5:55 6:42 tonight")
    }
}
