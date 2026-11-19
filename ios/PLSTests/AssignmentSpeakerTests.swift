import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
final class FakeVoice: AssignmentVoice {
    var spoken: [String] = []
    var fails = false
    var startMs: Double = 120
    func speak(_ text: String) async -> Double? {
        spoken.append(text)
        return fails ? nil : startMs
    }
}

@MainActor
@Suite struct AssignmentSpeakerTests {
    func assignment(_ ids: [String]) -> Assignment {
        Assignment(teamId: "T1", segmentIds: ids, taskText: "Walk the creek bank.", reason: "not spoken")
    }

    func speaker(onDevice: FakeVoice, cloud: FakeVoice, log: SpeechLog) -> AssignmentSpeaker {
        AssignmentSpeaker(onDevice: onDevice, makeCloud: { _ in cloud }, record: { log.entries.append($0) })
    }

    @Test func speaksOnceOnTheDeviceWhenNoCloudVoiceIsNamed() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let s = speaker(onDevice: onDevice, cloud: cloud, log: log)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true)
        await s.update(assignment(["AC"]), voiceTemplate: "", online: true, killCloud: false, signedIn: true)
        #expect(onDevice.spoken == ["New assignment. Segment A C. Walk the creek bank."])
        #expect(cloud.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    @Test func usesTheCloudVoiceWhenNamedAndOnline() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.startMs = 900
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true)
        #expect(cloud.spoken.count == 1)
        #expect(onDevice.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "spoken", startMs: 900)])
    }

    /// The cloud voice is a model: it never gets a phone number from the task text. The phone's own
    /// voice, which no model hears, reads the task as command wrote it.
    @Test func theCloudVoiceNeverGetsAPhoneNumber() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        let task = Assignment(teamId: "T1", segmentIds: ["AB"], taskText: "Call 404 555 0123 at the gate.", reason: "r")
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(task, voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true)
        #expect(cloud.spoken.count == 1 && !cloud.spoken[0].contains("555") && cloud.spoken[0].contains(PhoneNumbers.replacement))
        cloud.fails = true
        let other = Assignment(teamId: "T1", segmentIds: ["AC"], taskText: "Call 404 555 0123 at the gate.", reason: "r")
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(other, voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true)
        #expect(onDevice.spoken.last?.contains("404 555 0123") == true)
    }

    @Test func aFailedCloudVoiceFallsBackToTheDevice() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.fails = true
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true, killCloud: false, signedIn: true)
        #expect(onDevice.spoken.count == 1)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "failed", startMs: nil),
                                SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    @Test func noAssignmentSaysNothing() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(nil, voiceTemplate: "", online: true, killCloud: false, signedIn: true)
        #expect(onDevice.spoken.isEmpty && cloud.spoken.isEmpty && log.entries.isEmpty)
    }

    @Test func neverUsesTheCloudVoiceBeforeSignIn() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), voiceTemplate: "voice-model", online: true,
                                                                        killCloud: false, signedIn: false)
        #expect(cloud.spoken.isEmpty)
        #expect(onDevice.spoken.count == 1)
        #expect(log.entries.map(\.path) == [.onDevice])
    }
}

@MainActor
final class SpeechLog { var entries: [SpeechRecord] = [] }
