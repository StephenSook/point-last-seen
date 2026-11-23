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

    let grid: Set<String> = ["AA", "AB", "AC", "K"]

    func path(_ assignment: Assignment, model: String = "some-tts-model", online: Bool = true, killCloud: Bool = false,
              signedIn: Bool = true) -> SpokenAssignment.Path {
        SpokenAssignment.path(cloudModel: model, online: online, killCloud: killCloud, signedIn: signedIn,
                              assignment: assignment, gridIds: grid)
    }

    @Test func theCloudVoiceIsUsedOnlyWhenNamedOnlineAndNotKilled() {
        let code = a(["AB"], "Search segment AB.")
        #expect(path(code, model: "") == .onDevice)
        #expect(path(code, model: "  ") == .onDevice)
        #expect(path(code, online: false) == .onDevice)
        #expect(path(code, killCloud: true) == .onDevice)
        #expect(path(code) == .cloud)
        // The cloud voice is an AI Logic call, which needs the sign-in.
        #expect(path(code, signedIn: false) == .onDevice)
    }

    /// The command post writes the task line in code from the segment ids alone, but the rules let a command
    /// writer store any 200 characters. Only a line the phone can rebuild from the ids, with ids from this
    /// incident's grid, goes to the cloud voice; any other words are spoken by the phone's own voice.
    @Test func onlyATaskLineThePhoneCanRebuildGoesToTheCloudVoice() {
        #expect(path(a(["AB"], "Search segment AB.")) == .cloud)
        #expect(path(a(["AB", "AC"], "Search segment AB, AC.")) == .cloud)
        #expect(path(a([], "No segment left to assign.")) == .cloud)

        // A name, a phone number, or free text up to the rules' 200-character limit.
        #expect(path(a(["AB"], "Search segment AB. Ask for Mary Jones at the gate.")) == .onDevice)
        #expect(path(a(["AB"], "Search segment AB. Call 404 555 0123.")) == .onDevice)
        let free = String(repeating: "Walk the creek bank slowly. ", count: 8).prefix(200)
        #expect(free.count == 200)
        #expect(path(a(["AB"], String(free))) == .onDevice)
        #expect(path(a([], "")) == .onDevice)

        // Anything but the exact line: other spacing, another order, other punctuation.
        #expect(path(a(["AB"], "Search segment AB. ")) == .onDevice)
        #expect(path(a(["AB"], "search segment AB.")) == .onDevice)
        #expect(path(a(["AB", "AC"], "Search segment AC, AB.")) == .onDevice)
        #expect(path(a(["AB"], "Search segment AB")) == .onDevice)

        // Ids must be this incident's grid segments, in plain letters and digits: an id cannot carry a name or a number.
        #expect(path(a(["ZZ"], "Search segment ZZ.")) == .onDevice)
        #expect(path(a(["4045550123"], "Search segment 4045550123.")) == .onDevice)
        #expect(path(a(["MaryJones"], "Search segment MaryJones.")) == .onDevice)
        #expect(path(a(["\u{212A}"], "Search segment \u{212A}.")) == .onDevice)  // KELVIN SIGN, canonically equal to "K"
        #expect(path(a(["K"], "Search segment K.")) == .cloud)
        // Byte for byte: a line Swift calls equal (canonical equivalence) but with other bytes is not the code line.
        #expect(path(a(["K"], "Search segment \u{212A}.")) == .onDevice)
    }

    @Test func aVeryLongTaskIsCut() {
        let long = String(repeating: "walk ", count: 200)
        #expect(SpokenAssignment.text(a(["AC"], long)).count <= 400)
    }
}
