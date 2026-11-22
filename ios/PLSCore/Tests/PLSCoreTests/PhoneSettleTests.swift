import Testing
@testable import PLSCore

/// The public scrub runs one pass of the rule until the text stops changing, at most four passes in all.
@Suite struct PhoneSettleTests {
    @Test func itStopsAsSoonAsThePassChangesNothing() {
        var calls = 0
        let out = PhoneNumbers.settle("aaa", once: { s in calls += 1; return s.count > 1 ? String(s.dropLast()) : s },
                                      onCap: { Issue.record("capped") })
        #expect(out == "a" && calls == 3)
    }

    /// A text that never settles keeps the fourth pass's text, the most scrubbed, and the cap is reported.
    @Test func itStopsAfterFourPassesAndSaysSo() {
        var calls = 0, capped = 0
        let out = PhoneNumbers.settle("", once: { s in calls += 1; return s + "x" }, onCap: { capped += 1 })
        #expect(out == "xxxx" && calls == 4 && capped == 1 && PhoneNumbers.maxPasses == 4)
    }

    /// A note that a single pass already settles is read once more to see that, and no more.
    @Test func aSettledNoteIsReadTwice() {
        var calls = 0
        _ = PhoneNumbers.settle("Call 404-555-0123", once: { s in calls += 1; return PhoneNumbers.scrubOnce(s) }, onCap: {})
        #expect(calls == 2)
    }
}
