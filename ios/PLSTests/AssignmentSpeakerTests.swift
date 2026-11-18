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
        await s.update(assignment(["AC"]), cloudModel: "", online: true, killCloud: false)
        await s.update(assignment(["AC"]), cloudModel: "", online: true, killCloud: false)
        #expect(onDevice.spoken == ["New assignment. Segment A C. Walk the creek bank."])
        #expect(cloud.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    @Test func usesTheCloudVoiceWhenNamedAndOnline() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.startMs = 900
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), cloudModel: "voice-model", online: true, killCloud: false)
        #expect(cloud.spoken.count == 1)
        #expect(onDevice.spoken.isEmpty)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "spoken", startMs: 900)])
    }

    @Test func aFailedCloudVoiceFallsBackToTheDevice() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        cloud.fails = true
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(assignment(["AB"]), cloudModel: "voice-model", online: true, killCloud: false)
        #expect(onDevice.spoken.count == 1)
        #expect(log.entries == [SpeechRecord(path: .cloud, outcome: "failed", startMs: nil),
                                SpeechRecord(path: .onDevice, outcome: "spoken", startMs: 120)])
    }

    @Test func noAssignmentSaysNothing() async {
        let onDevice = FakeVoice(), cloud = FakeVoice(), log = SpeechLog()
        await speaker(onDevice: onDevice, cloud: cloud, log: log).update(nil, cloudModel: "", online: true, killCloud: false)
        #expect(onDevice.spoken.isEmpty && cloud.spoken.isEmpty && log.entries.isEmpty)
    }
}

@MainActor
final class SpeechLog { var entries: [SpeechRecord] = [] }
