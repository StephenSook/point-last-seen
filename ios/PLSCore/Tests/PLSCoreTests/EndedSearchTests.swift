import Testing
@testable import PLSCore

/// When command ends a search, the searcher's phone says so in the command post's own words, and a report the
/// server refused because the search had ended says that, not a generic "not delivered".
@Suite struct EndedSearchTests {
    @Test(arguments: [
        ("found", "Search ended: person found. No new reports are taken."),
        ("suspended", "Search ended: search suspended. No new reports are taken."),
        ("training_ended", "Search ended: training ended. No new reports are taken."),
        ("something_new", "Search ended. No new reports are taken."),
    ])
    func aClosedSearchSaysWhyAsTheCommandPostDoes(reason: String, line: String) {
        #expect(EchoText.endedLine(status: "closed", closedReason: reason) == line)
    }

    @Test func aClosedSearchWithNoReasonStillSaysItEnded() {
        #expect(EchoText.endedLine(status: "closed", closedReason: nil) == "Search ended. No new reports are taken.")
    }

    /// Any other status that is not open keeps the older line: the phone does not claim the search ended.
    @Test func anIncidentNotOpenForAnotherReasonSaysSo() {
        #expect(EchoText.endedLine(status: "archived", closedReason: nil) == "This incident is not open for searching.")
        #expect(EchoText.endedLine(status: nil, closedReason: nil) == "This incident is not open for searching.")
    }

    @Test func aReportRefusedAfterTheSearchEndedSaysSo() {
        #expect(EchoText.deliveryLine(.rejected(reason: "permission-denied"), searchEnded: true) == "Not taken: the search had ended.")
        // Only the rules' refusal is the search ending: a report refused for anything else keeps its own line.
        #expect(EchoText.deliveryLine(.rejected(reason: "unavailable"), searchEnded: true) == EchoText.deliveryLine(.rejected(reason: "unavailable")))
        #expect(EchoText.deliveryLine(.rejected(reason: Outbox.conflictReason), searchEnded: true)
                == EchoText.deliveryLine(.rejected(reason: Outbox.conflictReason)))
        // Delivered stays delivered, and one still on the phone waits for the server's answer.
        #expect(EchoText.deliveryLine(.acked, searchEnded: true) == "Delivered")
        #expect(EchoText.deliveryLine(.pending, searchEnded: true) == "On this phone only")
        // While the search is open, nothing changes.
        #expect(EchoText.deliveryLine(.rejected(reason: "permission-denied"), searchEnded: false)
                == EchoText.deliveryLine(.rejected(reason: "permission-denied")))
    }
}
