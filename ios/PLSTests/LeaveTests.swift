import Foundation
import PLSCore
import Testing
@testable import PLS

/// A searcher leaves the search on this phone: the mission goes, the team's topic is left, the
/// anonymous account is signed out, and the join form shows again. Client only.
@MainActor
@Suite struct LeaveTests {
    /// The phone's account: signing out leaves no user, and the next user is new, with no claims.
    final class Account: @unchecked Sendable {
        var uid: String? = "uid-1"
        var signOuts = 0
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
    }
}
