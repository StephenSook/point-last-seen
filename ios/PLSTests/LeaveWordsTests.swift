import Testing
@testable import PLS

/// Leaving deletes the phone's sign-in, and the button says so before it is tapped.
@Suite struct LeaveWordsTests {
    @Test func theLeaveButtonSaysItDeletesTheSignIn() {
        #expect(ReadyCheckView.leaveLabel == "Leave and delete this sign-in")
        #expect(ReadyCheckView.leaveDetail.contains("its sign-in is deleted"))
    }
}
