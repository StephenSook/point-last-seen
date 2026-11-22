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
        #expect(EchoText.endedDeliveryLine(.rejected(reason: "permission-denied"), refusedByTheEnd: true)
                == "Not taken: the search had ended.")
        // Delivered stays delivered, and one still on the phone waits for the server's answer.
        #expect(EchoText.endedDeliveryLine(.acked, refusedByTheEnd: true) == "Delivered")
        #expect(EchoText.endedDeliveryLine(.pending, refusedByTheEnd: true) == "On this phone only")
        #expect(EchoText.endedDeliveryLine(.checking, refusedByTheEnd: false) == "Checking delivery")
    }

    /// The ended search's list is read-only, with no Retry button: a report refused for anything but the end, or
    /// before it, says to ask command, never to retry.
    @Test func theEndedListNeverSaysRetry() {
        for (reason, byTheEnd) in [("permission-denied", false), ("unavailable", true), ("unavailable", false),
                                   (Outbox.conflictReason, true), ("invalid-argument", false)] {
            let line = EchoText.endedDeliveryLine(.rejected(reason: reason), refusedByTheEnd: byTheEnd)
            #expect(line == "Not delivered. Ask command", "\(reason) \(byTheEnd)")
            #expect(!line.contains("Retry"))
        }
    }
}
