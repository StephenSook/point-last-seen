import Foundation
import Testing
@testable import PLSCore

/// What the Live Activity shows for the team's task: the assigned segments and how many
/// reports are still on this phone. Never report text or anything about the subject.
@Suite struct TaskStatusTests {
    @Test func countsWaitingAndRefusedReports() {
        let s = TaskStatus.make(assignedSegmentIds: ["AC", "AB"],
                                states: [.pending, .checking, .acked, .rejected(reason: "not-on-server"), .rejected(reason: "permission-denied")])
        #expect(s.segments == "AB, AC")
        #expect(s.waiting == 2)
        #expect(s.needsAction == 2)
        #expect(s.line == "2 reports waiting for signal. 2 need a look.")
    }

    @Test func wordsForNoneOneAndNoAssignment() {
        #expect(TaskStatus.make(assignedSegmentIds: [], states: []).line == "All reports delivered.")
        #expect(TaskStatus.make(assignedSegmentIds: [], states: []).segments == "None yet")
        #expect(TaskStatus.make(assignedSegmentIds: ["AC"], states: [.pending]).line == "1 report waiting for signal.")
        #expect(TaskStatus.make(assignedSegmentIds: ["AC"], states: [.rejected(reason: "x")]).line == "1 needs a look.")
    }
}
