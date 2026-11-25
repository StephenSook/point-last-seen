@preconcurrency import ActivityKit
import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
final class FakeActivityClient: LiveActivityClient {
    var calls: [String] = []
    /// Every state the fake was asked to show, started or updated.
    var states: [TaskActivityAttributes.ContentState] = []
    var allowStart = true
    /// Whether the card this fake started is still up; a test sets it false to play iOS ending it.
    var running = false
    var isRunning: Bool { running }
    /// Cards an earlier run of the app left on the lock screen, by team (set before the controller is made).
    var leftover: [String: TaskActivityAttributes.ContentState] = [:]
    var hasCards: Bool { running || !leftover.isEmpty }
    func leftovers() -> [String: TaskActivityAttributes.ContentState] { leftover }
    func start(teamId: String, state: TaskActivityAttributes.ContentState) -> Bool {
        calls.append("start \(teamId) \(state.status.segments) \(state.status.waiting) night=\(state.night)")
        states.append(state)
        running = allowStart
        if allowStart { leftover = [:] }                                   // the real start ends old cards
        return allowStart
    }
    func update(_ state: TaskActivityAttributes.ContentState) {
        calls.append("update \(state.status.segments) \(state.status.waiting) night=\(state.night)")
        states.append(state)
    }
    func end() {
        calls.append("end")
        running = false
        leftover = [:]
    }
}

@MainActor
@Suite struct TaskActivityControllerTests {
    let ac = TaskStatus.make(assignedSegmentIds: ["AC"], states: [])
    let acWaiting = TaskStatus.make(assignedSegmentIds: ["AC"], states: [.pending])
    let gs = TaskStatus.make(assignedSegmentIds: ["GS"], states: [])
    let hq = TaskStatus.make(assignedSegmentIds: ["HQ"], states: [])

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
        #expect(fake.calls == ["start T1 AC 0 night=false", "update AC 1 night=false", "update AC 1 night=true", "end"])
    }

    /// iOS ends a Live Activity after 8 hours and keeps its last card on the lock screen for up to 4 more.
    /// An update to an ended activity does nothing, so a new assignment must put up a fresh card instead.
    @Test func aCardIOSEndedIsStartedAgainWithTheNewAssignment() {
        let fake = FakeActivityClient()
        let c = TaskActivityController(client: fake)
        c.sync(teamId: "T1", status: gs, night: false)
        fake.running = false                                               // the 8-hour limit
        c.sync(teamId: "T1", status: hq, night: false)
        #expect(fake.calls == ["start T1 GS 0 night=false", "end", "start T1 HQ 0 night=false"])
    }

    /// In the background iOS refuses a new card. The app still asks iOS to remove the ended card, and the
    /// next change tries again. (Whether iOS removes a card it ended itself is not shown by any test.)
    @Test func aRefusedRestartStillAsksToRemoveTheOldCard() {
        let fake = FakeActivityClient()
        let c = TaskActivityController(client: fake)
        c.sync(teamId: "T1", status: gs, night: false)
        fake.running = false
        fake.allowStart = false
        c.sync(teamId: "T1", status: hq, night: false)
        fake.allowStart = true
        c.sync(teamId: "T1", status: hq, night: false)
        #expect(fake.calls == ["start T1 GS 0 night=false", "end", "start T1 HQ 0 night=false", "start T1 HQ 0 night=false"])
    }

    /// Opening the app puts back a card iOS ended, also when the assignment did not change.
    @Test func comingToTheFrontPutsBackAnEndedCard() {
        let fake = FakeActivityClient()
        let c = TaskActivityController(client: fake)
        c.refresh()                                                        // nothing synced yet: nothing
        c.sync(teamId: "T1", status: gs, night: false)
        c.refresh()                                                        // still up: nothing
        fake.running = false
        c.refresh()
        #expect(fake.calls == ["start T1 GS 0 night=false", "end", "start T1 GS 0 night=false"])
    }

    /// iOS can end the card between the check and an update it then ignores. The app re-checks each minute
    /// while it is in front, and that check puts the new segments on a fresh card.
    @Test func anUpdateIOSIgnoredIsPutRightOnTheNextCheck() {
        let fake = FakeActivityClient()
        let c = TaskActivityController(client: fake)
        c.sync(teamId: "T1", status: gs, night: false)
        c.sync(teamId: "T1", status: hq, night: false)                    // sent, but the card had just ended
        fake.running = false
        c.refresh()
        #expect(fake.calls == ["start T1 GS 0 night=false", "update HQ 0 night=false", "end", "start T1 HQ 0 night=false"])
    }

    /// The card says when it was set, so a searcher can tell a card the app keeps current from one
    /// left from earlier (the app cannot change the card while it is closed).
    @Test func theCardSaysWhenItWasSet() {
        let fake = FakeActivityClient()
        var clock = Date(timeIntervalSince1970: 1_000)
        let c = TaskActivityController(client: fake, now: { clock })
        c.sync(teamId: "T1", status: gs, night: false)
        clock = Date(timeIntervalSince1970: 2_000)
        c.sync(teamId: "T1", status: gs, night: true)                     // dusk only: the same time
        clock = Date(timeIntervalSince1970: 3_000)
        c.sync(teamId: "T1", status: hq, night: true)                     // new segments: a new time
        clock = Date(timeIntervalSince1970: 4_000)
        fake.running = false
        c.refresh()                       // a fresh card, the same content: the time it was set, not now
        clock = Date(timeIntervalSince1970: 5_000)
        fake.running = false
        c.sync(teamId: "T1", status: gs, night: true)                     // a fresh card with new segments: now
        clock = Date(timeIntervalSince1970: 6_000)
        c.sync(teamId: "T2", status: gs, night: true)                     // another team: now
        #expect(fake.states.map { $0.setAt?.timeIntervalSince1970 } == [1_000, 1_000, 3_000, 3_000, 5_000, 6_000])
    }

    /// After a fresh start of the app (offline, from the cache) the new card keeps the time of the card the
    /// earlier run left with the same content, instead of claiming a check made now.
    @Test func aFreshRunKeepsTheTimeOfTheCardItFinds() {
        let fake = FakeActivityClient()
        fake.leftover = ["T1": TaskActivityAttributes.ContentState(status: gs, night: false,
                                                                    setAt: Date(timeIntervalSince1970: 1_000))]
        let c = TaskActivityController(client: fake, now: { Date(timeIntervalSince1970: 9_000) })
        c.sync(teamId: "T1", status: gs, night: false)
        #expect(fake.states.map { $0.setAt?.timeIntervalSince1970 } == [1_000])
    }

    /// A card left with other content, or by a build without the time, does not lend its time.
    @Test func aFreshRunTakesTheTimeNowForOtherContent() {
        for left in [TaskActivityAttributes.ContentState(status: gs, night: false, setAt: Date(timeIntervalSince1970: 1_000)),
                     TaskActivityAttributes.ContentState(status: hq, night: false)] {
            let fake = FakeActivityClient()
            fake.leftover = ["T1": left]
            let c = TaskActivityController(client: fake, now: { Date(timeIntervalSince1970: 9_000) })
            c.sync(teamId: "T1", status: hq, night: false)
            #expect(fake.states.map { $0.setAt?.timeIntervalSince1970 } == [9_000])
        }
    }

    /// A run with no search loaded takes down a card an earlier run left (the searcher may have been taken
    /// off the team meanwhile), once.
    @Test func noSearchLoadedTakesDownACardAnEarlierRunLeft() {
        let fake = FakeActivityClient()
        fake.leftover = ["T1": TaskActivityAttributes.ContentState(status: gs, night: false)]
        let c = TaskActivityController(client: fake)
        c.sync(teamId: nil, status: nil, night: false)
        c.refresh()
        #expect(fake.calls == ["end"])
    }

    /// A card a build without the time put up still draws after the update (with no time line).
    @Test func aCardWithoutATimeStillDecodes() throws {
        let old = #"{"status":{"segments":"GS","waiting":0,"needsAction":0},"night":false}"#
        let state = try JSONDecoder().decode(TaskActivityAttributes.ContentState.self, from: Data(old.utf8))
        #expect(state.status.segments == "GS")
        #expect(state.setAt == nil)
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
        // The end is an async system call: wait for it, at most 10 seconds.
        var stillUp = true
        for _ in 0..<100 where stillUp {
            stillUp = Activity<TaskActivityAttributes>.activities.contains { $0.attributes.teamId == "T-test" && $0.activityState == .active }
            if stillUp { try await Task.sleep(for: .milliseconds(100)) }
        }
        #expect(!stillUp)
    }

    /// A new run of the app (a second client) sees the card the first left, with what it shows, and takes it
    /// down with its own end.
    @Test func aNewRunSeesAndEndsTheCardAnEarlierRunLeft() async throws {
        let earlier = ActivityKitClient()
        let shown = TaskActivityAttributes.ContentState(status: TaskStatus.make(assignedSegmentIds: ["GS"], states: []),
                                                        night: false, setAt: Date(timeIntervalSince1970: 1_000))
        #expect(earlier.start(teamId: "T-left", state: shown))
        let later = ActivityKitClient()
        #expect(later.hasCards)
        #expect(later.leftovers()["T-left"] == shown)
        later.end()
        var listed = true
        for _ in 0..<100 where listed {
            listed = Activity<TaskActivityAttributes>.activities.contains { $0.attributes.teamId == "T-left" && $0.activityState == .active }
            if listed { try await Task.sleep(for: .milliseconds(100)) }
        }
        #expect(!listed)
    }

    /// A card ended outside the client (as iOS does at the 8-hour limit) is no longer running.
    @Test func theRealClientNoticesACardEndedOutsideIt() async throws {
        let client = ActivityKitClient()
        let state = TaskActivityAttributes.ContentState(status: TaskStatus.make(assignedSegmentIds: ["GS"], states: []), night: false)
        #expect(client.start(teamId: "T-ended", state: state))
        #expect(client.isRunning)
        for activity in Activity<TaskActivityAttributes>.activities where activity.attributes.teamId == "T-ended" {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        // The state change is an async system event: wait for it, at most 10 seconds.
        var running = true
        for _ in 0..<100 where running {
            running = client.isRunning
            if running { try await Task.sleep(for: .milliseconds(100)) }
        }
        #expect(!running)
        client.end()
    }
}
