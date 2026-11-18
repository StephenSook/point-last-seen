@preconcurrency import ActivityKit
import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
final class FakeActivityClient: LiveActivityClient {
    var calls: [String] = []
    var allowStart = true
    func start(teamId: String, state: TaskActivityAttributes.ContentState) -> Bool {
        calls.append("start \(teamId) \(state.status.segments) \(state.status.waiting) night=\(state.night)")
        return allowStart
    }
    func update(_ state: TaskActivityAttributes.ContentState) { calls.append("update \(state.status.waiting) night=\(state.night)") }
    func end() { calls.append("end") }
}

@MainActor
@Suite struct TaskActivityControllerTests {
    let ac = TaskStatus.make(assignedSegmentIds: ["AC"], states: [])
    let acWaiting = TaskStatus.make(assignedSegmentIds: ["AC"], states: [.pending])

    @Test func startsOnceUpdatesOnChangeAndEndsWhenThePackGoes() {
        let fake = FakeActivityClient()
        let c = TaskActivityController(client: fake)
        c.sync(teamId: nil, status: nil, night: false)                    // no pack: nothing
        c.sync(teamId: "T1", status: ac, night: false)
        c.sync(teamId: "T1", status: ac, night: false)                    // same state: no update
        c.sync(teamId: "T1", status: acWaiting, night: false)
        c.sync(teamId: "T1", status: acWaiting, night: true)              // dusk: colours change
        c.sync(teamId: nil, status: nil, night: true)
        c.sync(teamId: nil, status: nil, night: true)                     // already ended
        #expect(fake.calls == ["start T1 AC 0 night=false", "update 1 night=false", "update 1 night=true", "end"])
    }

    @Test func aRefusedStartIsTriedAgainOnTheNextChange() {
        let fake = FakeActivityClient()
        fake.allowStart = false
        let c = TaskActivityController(client: fake)
        c.sync(teamId: "T1", status: ac, night: false)
        fake.allowStart = true
        c.sync(teamId: "T1", status: acWaiting, night: false)
        #expect(fake.calls == ["start T1 AC 0 night=false", "start T1 AC 1 night=false"])
    }
}

@MainActor
@Suite struct ActivityKitClientTests {
    /// On the simulator the real client puts an actual Live Activity up and takes it down.
    @Test func theRealClientStartsAndEndsALiveActivity() async throws {
        let client = ActivityKitClient()
        let state = TaskActivityAttributes.ContentState(status: TaskStatus.make(assignedSegmentIds: ["AC"], states: [.pending]), night: false)
        #expect(client.start(teamId: "T-test", state: state))
        #expect(Activity<TaskActivityAttributes>.activities.contains { $0.attributes.teamId == "T-test" && $0.activityState == .active })
        client.end()
        try await Task.sleep(for: .seconds(1))
        #expect(!Activity<TaskActivityAttributes>.activities.contains { $0.attributes.teamId == "T-test" && $0.activityState == .active })
    }
}
