import Testing
@testable import PLS

/// The words a searcher sees before a mission is loaded point at the join, which now exists.
@Suite struct JoinViewTests {
    @Test func theNoMissionHintPointsAtTheJoin() {
        #expect(TaskView.noMissionHint == "Join your team at the Ready check before you leave signal.")
        #expect(JoinView.title == "Join your team")
        #expect(JoinView.codeLabel == "Join code" && JoinView.teamLabel == "Team, for example T1")
    }
}
