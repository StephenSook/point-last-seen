import Testing
@testable import PLSCore

/// Spoken assignment changes for searchers whose eyes are on the ground. The input is command's
/// approved plan only: the segment ids and the approved task text. Never report text or profile.
@Suite struct SpokenAssignmentTests {
    func a(_ ids: [String], _ task: String = "Search the creek bank, walk slowly.") -> Assignment {
        Assignment(teamId: "T1", segmentIds: ids, taskText: task, reason: "highest probability left")
    }

    @Test func theWordsAreTheSegmentsAndTheApprovedTask() {
        #expect(SpokenAssignment.text(a(["AC", "AB"])) == "New assignment. Segments A B and A C. Search the creek bank, walk slowly.")
        #expect(SpokenAssignment.text(a(["AD"], "  ")) == "New assignment. Segment A D.")
        #expect(SpokenAssignment.text(a(["AA", "AB", "AC"])) == "New assignment. Segments A A, A B and A C. Search the creek bank, walk slowly.")
    }

    @Test func theReasonIsNeverSpoken() {
        #expect(!SpokenAssignment.text(a(["AC"])).contains("probability"))
    }

    @Test func speaksOnlyWhenWhatItWouldSayChanges() {
        #expect(SpokenAssignment.shouldSpeak(previous: nil, current: a(["AC"])))
        #expect(!SpokenAssignment.shouldSpeak(previous: a(["AC"]), current: a(["AC"])))
        #expect(SpokenAssignment.shouldSpeak(previous: a(["AC"]), current: a(["AB"])))
        #expect(SpokenAssignment.shouldSpeak(previous: a(["AC"]), current: a(["AC"], "Hold at the gate.")))
        #expect(!SpokenAssignment.shouldSpeak(previous: a(["AC"]), current: nil))
    }

    @Test func theCloudVoiceIsUsedOnlyWhenNamedOnlineAndNotKilled() {
        #expect(SpokenAssignment.path(cloudModel: "", online: true, killCloud: false) == .onDevice)
        #expect(SpokenAssignment.path(cloudModel: "  ", online: true, killCloud: false) == .onDevice)
        #expect(SpokenAssignment.path(cloudModel: "some-tts-model", online: false, killCloud: false) == .onDevice)
        #expect(SpokenAssignment.path(cloudModel: "some-tts-model", online: true, killCloud: true) == .onDevice)
        #expect(SpokenAssignment.path(cloudModel: "some-tts-model", online: true, killCloud: false) == .cloud)
    }

    @Test func aVeryLongTaskIsCut() {
        let long = String(repeating: "walk ", count: 200)
        #expect(SpokenAssignment.text(a(["AC"], long)).count <= 400)
    }
}
