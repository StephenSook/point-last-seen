import Foundation
import PLSCore
import Testing
@testable import PLS

/// A searcher leaves the search on this phone: the mission goes, the team's topic is left, the
/// anonymous account is deleted on the server and signed out, and the join form shows again.
@MainActor
@Suite struct LeaveTests {
    /// The phone's account: signing out leaves no user, and the next user is new, with no claims.
    final class Account: @unchecked Sendable {
        var uid: String? = "uid-1"
        var signOuts = 0
        /// Whether the account was still signed in when the delete was asked for.
        var signedInAtDelete: Bool?
    }

    func model(_ account: Account, _ backend: FakeJoinBackend, topics: FakePushTopics = FakePushTopics(),
               voice: FakeVoice = FakeVoice()) throws -> AppModel {
        let segments = try DrillDocs.segments()
        let first = segments.compactMap { if case let .string(id)? = $0["segmentId"], id != "ROW" { id } else { nil } }.first ?? ""
        let reader = FakeMissionReader(docs: MissionDocs(incident: try DrillDocs.incident(), segments: segments,
                                                         plan: DrillDocs.plan(segmentIds: [first], version: 18), sharedProfile: nil))
        return AppModel(signIn: SignIn(isSignedIn: { account.uid != nil }, attempt: { true },
                                       signOut: { account.uid = nil; account.signOuts += 1; backend.claims = [:] }),
                        speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }),
                        uid: { account.uid }, joinBackend: backend, missionReader: reader, pushTopics: topics,
                        alerts: FakeAlerts(), defaults: UserDefaults(suiteName: "leave-\(UUID().uuidString)")!)
    }

    @Test func leavingShowsTheJoinFormAgain() async throws {
        let account = Account(), backend = FakeJoinBackend(), topics = FakePushTopics(), voice = FakeVoice()
        let m = try model(account, backend, topics: topics, voice: voice)
        await m.trySignIn()
        await m.topicFollow?.value
        #expect(m.mission?.teamId == "T1" && topics.ops == ["+pls-drill-dev-1-T1"])
        let stops = voice.stops
        #expect(await m.leaveSearch())
        // The Ready check shows the join form when no mission is loaded; nothing offers a re-read.
        #expect(m.mission == nil && !m.canRetryMission && !m.signedIn)
        #expect(account.signOuts == 1 && voice.stops > stops)
        #expect(topics.ops == ["+pls-drill-dev-1-T1", "-pls-drill-dev-1-T1"])
    }

    @Test func aPushForTheOldTeamAfterLeavingOpensNothing() async throws {
        let account = Account(), backend = FakeJoinBackend()
        let m = try model(account, backend)
        await m.trySignIn()
        #expect(await m.leaveSearch())
        // No user yet: Auth cannot confirm anything, and nothing opens.
        await m.openedPush(PushPayload(incidentId: "drill-dev-1", teamId: "T1", planVersion: 18))
        #expect(m.openTaskRequests == 0 && m.mission == nil)
        // A new anonymous user has no claims: still nothing opens or loads.
        account.uid = "uid-2"
        await m.openedPush(PushPayload(incidentId: "drill-dev-1", teamId: "T1", planVersion: 18))
        #expect(m.openTaskRequests == 0 && m.mission == nil)
    }

    /// Leaving goes through the same account change as any sign-out: once it has, Auth's own later
    /// report of that sign-out finds nothing left to do (no second stop, no drop).
    @Test func leavingIsTheSameAccountChangeAsAnySignOut() async throws {
        let account = Account(), backend = FakeJoinBackend(), voice = FakeVoice()
        let m = try model(account, backend, voice: voice)
        await m.trySignIn()
        await m.accountChanged()                                  // Auth reports the user at launch
        #expect(await m.leaveSearch())
        let stops = voice.stops
        await m.accountChanged()                                  // Auth reports the sign-out
        #expect(voice.stops == stops && m.mission == nil)
    }

    /// A report not yet settled with the server belongs to this user's write queue: leaving now
    /// would strand it, so the phone says why and stays.
    @Test func leavingWaitsForEveryReportToReachCommand() async throws {
        let account = Account(), backend = FakeJoinBackend()
        let m = try model(account, backend)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leave-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let server = FakeEventServer()
        server.holdWrites = true
        let store = try EventStore(server: server, outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await m.trySignIn()
        let segment = try #require(m.mission?.assignedSegmentIds.first)
        #expect(await m.submitPick(PickListChoice(kind: .clue, segmentId: segment, minutes: nil, searchers: nil)))
        #expect(store.entries.count == 1)
        #expect(await m.leaveSearch() == false)
        #expect(m.mission?.teamId == "T1" && account.signOuts == 0 && m.problem == AppModel.leaveBlocked)
        #expect(backend.deletes == 0 && m.leaveRefusal == AppModel.leaveBlocked)
    }

    /// Leaving deletes this phone's account on the server while it is still signed in (the callable acts on
    /// its caller), then signs out; nothing more needs saying.
    @Test func leavingDeletesTheAccountOnTheServer() async throws {
        let account = Account(), backend = FakeJoinBackend()
        let m = try model(account, backend)
        await m.trySignIn()
        backend.onDelete = { account.signedInAtDelete = account.uid != nil }
        #expect(await m.leaveSearch())
        #expect(backend.deletes == 1 && account.signedInAtDelete == true && account.signOuts == 1)
        #expect(m.mission == nil && m.joinMessage == nil)
    }

    /// When the delete fails (no signal, or the server refused), nothing changes: the phone stays in the search,
    /// signed in and on the team's topic, and says to try again in signal, so no sign-in is left behind.
    @Test func whenTheDeleteFailsThePhoneStaysInTheSearch() async throws {
        let account = Account(), backend = FakeJoinBackend(), topics = FakePushTopics()
        backend.deleteAnswer = false
        let m = try model(account, backend, topics: topics)
        await m.trySignIn()
        await m.topicFollow?.value
        #expect(await m.leaveSearch() == false)
        #expect(backend.deletes == 1 && account.signOuts == 0 && m.signedIn && m.mission?.teamId == "T1")
        #expect(topics.ops == ["+pls-drill-dev-1-T1"])
        #expect(m.problem == AppModel.leaveNeedsDelete && m.leaveRefusal == AppModel.leaveNeedsDelete)
    }

    /// A delete whose reply was lost (the server deleted the account, then the signal dropped) is safe to try
    /// again: the server, or the phone's own Auth, answers that the account is gone, and the phone leaves as normal.
    @Test func leavingAgainAfterALostReplyLeavesAsNormal() async throws {
        let account = Account(), backend = FakeJoinBackend()
        backend.deleteAnswer = false
        let m = try model(account, backend)
        await m.trySignIn()
        #expect(await m.leaveSearch() == false)
        backend.deleteAnswer = true
        #expect(await m.leaveSearch())
        #expect(backend.deletes == 2 && account.signOuts == 1 && m.mission == nil)
        #expect(m.joinMessage == nil && m.problem == nil && m.leaveRefusal == nil)
    }
}
