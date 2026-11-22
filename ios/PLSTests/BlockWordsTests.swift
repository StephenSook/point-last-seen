import Testing
@testable import PLS

/// Block on this phone says what it does and that it is this phone only, in the words the searcher reads.
@Suite struct BlockWordsTests {
    @Test func theBlockWordsSayItIsThisPhoneOnly() {
        #expect(ReadyCheckView.blockLabel == "Block on this phone")
        #expect(ReadyCheckView.blockDetail
            == "The family's description is hidden on this phone for this search. Command still has it. You can show it again here.")
        #expect(ReadyCheckView.blockedLine == "You blocked the family's description on this phone.")
        #expect(ReadyCheckView.showAgainLabel == "Show again")
        // Offered right after a report about the family's description.
        #expect(ReportProblemView.blockAfterLabel == "Also block it on this phone")
        #expect(ReportProblemView.blockedAfterLine == "Blocked on this phone.")
    }
}
