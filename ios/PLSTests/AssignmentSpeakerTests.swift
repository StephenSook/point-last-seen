import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
final class FakeVoice: AssignmentVoice {
    var spoken: [String] = []
    var fails = false
    var startMs: Double = 120
    private(set) var stops = 0
    /// Runs before any sound would start, as a cloud voice's fetch does.
    var beforeSound: (@MainActor () -> Void)?
    func speak(_ text: String, ifStillWanted stillWanted: @MainActor () -> Bool) async -> Double? {
        beforeSound?()
        guard stillWanted() else { return nil }
        spoken.append(text)
        return fails ? nil : startMs
    }
    func stop() { stops += 1 }
}

@MainActor
@Suite struct AssignmentSpeakerTests {
    let grid: Set<String> = ["AB", "AC"]

    /// The task line as the command post writes it, in code from the segment ids.
    func assignment(_ ids: [String]) -> Assignment {
        Assignment(teamId: "T1", segmentIds: ids, taskText: SpokenAssignment.codeTaskLine(ids), reason: "not spoken")
    }

    func speaker(onDevice: FakeVoice, cloud: FakeVoice, log: SpeechLog) -> AssignmentSpeaker {
        AssignmentSpeaker(onDevice: onDevice, makeCloud: { _ in cloud }, record: { log.entries.append($0) })
    }

    @Test func speaksOnceOnTheDeviceWhenNoCloudVoiceIsNamed() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let s = speaker(onDevice: onDevice, cloud: cloud, log: log)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true, gridIds: grid)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(onDevice.spoken == ["New assignment. Segment A C. Search segment AC."])
        #expect(cloud.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    @Test func usesTheCloudVoiceWhenNamedAndOnline() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.startMs = 900
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(cloud.spoken.count == 1)
        #expect(onDevice.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "spoken", startMs: 900)])
    }

    /// A task line the phone cannot rebuild from the segment ids (a name, a phone number, any words
    /// command typed) never goes to the cloud voice, even when it is named, online and signed in. The
    /// phone's own voice, which no model hears, reads it as command wrote it.
    @Test func aTaskLineThePhoneCannotRebuildNeverGoesToTheCloudVoice() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let task = Assignment(teamId: "T1", segmentIds: ["AB"], taskText: "Search segment AB. Call 404 555 0123, ask for Mary Jones.",
                              reason: "r")
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(task, voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(cloud.spoken.isEmpty)
        #expect(onDevice.spoken == ["New assignment. Segment A B. Search segment AB. Call 404 555 0123, ask for Mary Jones."])
        #expect(log.entries.map(\.path) == [.onDevice])
    }

    /// The cloud voice is a model: it never gets a phone number, even one that is a grid segment id.
    @Test func theCloudVoiceNeverGetsAPhoneNumber() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let task = assignment(["4045550123"])
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(task, voiceTemplate: "voice-model", online: true, killCloud: false,
                                                                        signedIn: true, gridIds: ["4045550123"])
        #expect(cloud.spoken.count == 1 && !cloud.spoken[0].contains("555") && !cloud.spoken[0].contains("5 5 5")
                && cloud.spoken[0].contains(PhoneNumbers.replacement))
    }

    @Test func aFailedCloudVoiceFallsBackToTheDevice() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.fails = true
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(onDevice.spoken.count == 1)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "failed", startMs: nil),
                                SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    /// A line no longer wanted when its sound would start (the mission was dropped while the cloud
    /// voice was fetching) is not played, and the phone's own voice does not stand in for it.
    @Test func aLineNoLongerWantedIsNotPlayedOrReplaced() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        var wanted = true
        cloud.beforeSound = { wanted = false }
        await speaker(onDevice: onDevice, cloud: cloud, log: log)
            .update(assignment(["AB"]), voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true, gridIds: grid,
                    isCurrent: { wanted })
        #expect(cloud.spoken.isEmpty && onDevice.spoken.isEmpty)
    }

    /// Stopping silences both voices and forgets the last line, so the same assignment is spoken
    /// again for a new membership.
    @Test func stopSilencesTheVoicesAndForgetsTheLastLine() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let s = speaker(onDevice: onDevice, cloud: cloud, log: log)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true, gridIds: grid)
        s.stop()
        #expect(onDevice.stops == 1)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(onDevice.spoken.count == 2)
    }

    @Test func noAssignmentSaysNothing() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(nil, voiceTemplate: "", online: true, killCloud: false, signedIn: true, gridIds: grid)
        #expect(onDevice.spoken.isEmpty && cloud.spoken.isEmpty && log.entries.isEmpty)
    }

    @Test func neverUsesTheCloudVoiceBeforeSignIn() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true,
                                                                        killCloud: false, signedIn: false, gridIds: grid)
        #expect(cloud.spoken.isEmpty)
        #expect(onDevice.spoken.count == 1)
        #expect(log.entries.map(\.path) == [.onDevice])
    }
}

@MainActor
final class SpeechLog { var entries: [SpeechRecord] = [] }
