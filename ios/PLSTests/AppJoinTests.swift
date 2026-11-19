import Foundation
import PLSCore
import Testing
@testable import PLS

/// Holds a read open until the test lets it finish.
final class ReadGate: @unchecked Sendable {
    private let lock = NSLock()
    private var waiter: CheckedContinuation<Void, Never>?
    private var open = false
    var isWaiting: Bool { lock.withLock { waiter != nil } }
    func wait() async {
        await withCheckedContinuation { c in
            lock.lock()
            if open { lock.unlock(); c.resume() } else { waiter = c; lock.unlock() }
        }
    }
    func release() {
        let c = lock.withLock { () -> CheckedContinuation<Void, Never>? in open = true; defer { waiter = nil }; return waiter }
        c?.resume()
    }
}

/// Serves the drill incident's documents, or fails as the network does.
final class FakeMissionReader: MissionReader, @unchecked Sendable {
    var docs: MissionDocs?
    private(set) var reads: [String] = []
    private(set) var watching: [String] = []
    private(set) var stops = 0
    var onPlan: (@MainActor (JSONValue) -> Void)?

    func watchLatestPlan(incidentId: String, onPlan: @escaping @MainActor (JSONValue) -> Void) -> @Sendable () -> Void {
        watching.append(incidentId)
        self.onPlan = onPlan
        return { [weak self] in self?.stops += 1 }
    }
    init(docs: MissionDocs?) { self.docs = docs }
    /// The next read waits here (one read only).
    var holdNextRead: ReadGate?

    func read(incidentId: String) async throws -> MissionDocs {
        reads.append(incidentId)
        if let gate = holdNextRead {
            holdNextRead = nil
            await gate.wait()
        }
        guard let docs else { throw URLError(.notConnectedToInternet) }
        return docs
    }
}

/// After a join the phone reads its team's mission and loads it; at launch, a searcher who joined
/// before gets it back from the token's claims.
@MainActor
@Suite struct AppJoinTests {
    func drillDocs(status: String = "open") throws -> MissionDocs {
        let segments = try DrillDocs.segments()
        let first = segments.compactMap { if case let .string(id)? = $0["segmentId"], id != "ROW" { id } else { nil } }.first ?? ""
        return MissionDocs(incident: try DrillDocs.incident(status: status), segments: segments,
                           plan: DrillDocs.plan(segmentIds: [first]), sharedProfile: DrillDocs.shared)
    }

    func model(_ backend: FakeJoinBackend, _ reader: FakeMissionReader, voice: FakeVoice = FakeVoice()) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                 speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }),
                 joinBackend: backend, missionReader: reader)
    }

    /// A plan command approves after the mission loaded reaches the phone: the assignment changes
    /// and is spoken once; the same plan again says nothing; a plan with no task for this team
    /// clears it without speaking.
    @Test func aNewerPlanReachesTheLoadedMission() async throws {
        let reader = FakeMissionReader(docs: try drillDocs())
        let voice = FakeVoice()
        let m = model(FakeJoinBackend(), reader, voice: voice)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(reader.watching == ["drill-dev-1"] && voice.spoken.count == 1)
        let segments = try #require(m.mission?.grid.map(\.segmentId))
        let newer = DrillDocs.plan(segmentIds: [segments.last ?? ""], task: "Search the north field.", version: 3)
        await m.planArrived(newer, incidentId: "drill-dev-1", teamId: "T1")
        #expect(m.mission?.assignment?.taskText == "Search the north field." && m.mission?.assignedSegmentIds == [segments.last ?? ""])
        #expect(voice.spoken.count == 2)
        await m.planArrived(newer, incidentId: "drill-dev-1", teamId: "T1")
        #expect(voice.spoken.count == 2)
        await m.planArrived(DrillDocs.plan(segmentIds: ["X"], version: 4, team: "T2"), incidentId: "drill-dev-1", teamId: "T1")
        #expect(m.mission?.assignment == nil && m.mission?.assignedSegmentIds.isEmpty == true && voice.spoken.count == 2)
        // A plan for another incident is not this mission's.
        await m.planArrived(newer, incidentId: "other", teamId: "T1")
        #expect(m.mission?.assignment == nil)
    }

    /// After sign-in the claims are read fresh from the server, so a team change command made
    /// since the last token reaches the phone; with no signal, the cached token answers.
    @Test func afterSignInTheClaimsAreReadFresh() async throws {
        let backend = FakeJoinBackend()
        let m = model(backend, FakeMissionReader(docs: try drillDocs()))
        await m.trySignIn()
        #expect(backend.claimRefreshes == [true] && m.mission?.teamId == "T1")
        backend.refreshFails = true
        await m.trySignIn()
        #expect(backend.claimRefreshes == [true, true, false] && m.mission?.teamId == "T1")
    }

    @Test func aTeamChangeFollowsTheClaimsAndALostRoleDropsTheMission() async throws {
        let backend = FakeJoinBackend()
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(backend, reader)
        await m.trySignIn()
        #expect(m.mission?.teamId == "T1")
        backend.claims["team"] = .string("T2")
        await m.trySignIn()
        #expect(m.mission?.teamId == "T2" && reader.stops == 1)
        backend.claims = ["inc": .string("drill-dev-1"), "role": .string("family")]
        await m.trySignIn()
        #expect(m.mission == nil && reader.stops == 2)
    }

    /// The server granted the join but the mission could not be read: trying again reads the
    /// mission and never sends the code again (a one-use code would be refused).
    @Test func aMissionThatFailedToLoadIsReadAgainWithoutTheCode() async throws {
        let backend = newcomer()
        let reader = FakeMissionReader(docs: nil)
        let m = model(backend, reader)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(m.joinMessage == AppModel.missionUnread && m.mission == nil && m.canRetryMission)
        reader.docs = try drillDocs()
        await m.retryMission()
        #expect(m.mission?.teamId == "T1" && m.joinMessage == nil && !m.canRetryMission)
        #expect(backend.steps.filter { $0 == "call" }.count == 1)
    }

    /// A role lost while the mission has not loaded yet is dropped at the next sign-in: no
    /// membership is kept and "Read the mission again" is no longer offered.
    @Test func aLostRoleDropsAMembershipWhoseMissionNeverLoaded() async throws {
        let backend = newcomer()
        let reader = FakeMissionReader(docs: nil)
        let m = model(backend, reader)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(m.mission == nil && m.canRetryMission)
        backend.claims = ["inc": .string("drill-dev-1"), "role": .string("family")]
        await m.trySignIn()
        #expect(!m.canRetryMission && m.mission == nil)
    }

    /// "Read the mission again" checks the claims first: a role command took away reads nothing.
    @Test func readingTheMissionAgainChecksTheClaimsFirst() async throws {
        let backend = newcomer()
        let reader = FakeMissionReader(docs: nil)
        let m = model(backend, reader)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(m.canRetryMission)
        backend.claims = ["inc": .string("drill-dev-1"), "role": .string("family")]
        reader.docs = try drillDocs()
        let readsBefore = reader.reads.count
        await m.retryMission()
        #expect(reader.reads.count == readsBefore && m.mission == nil && !m.canRetryMission)
        #expect(m.joinMessage == AppModel.notOnATeam)
    }

    /// Joining a team the phone already holds reads the mission without spending the code.
    @Test func aTeamAlreadyHeldIsNotJoinedAgain() async throws {
        let backend = FakeJoinBackend()
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(backend, reader)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(!backend.steps.contains("call") && m.mission?.teamId == "T1")
        // Another team is a real join.
        backend.claimsAfterJoin = ["inc": .string("drill-dev-1"), "role": .string("searcher"), "team": .string("T2")]
        await m.join(code: "ABCDEFGH", teamId: "T2", incidentId: "")
        #expect(backend.steps.contains("call") && m.mission?.teamId == "T2")
    }

    /// A slow load from before (launch) never replaces a join that finished after it started.
    @Test func aSlowEarlierLoadNeverReplacesANewerJoin() async throws {
        let backend = FakeJoinBackend()
        let reader = FakeMissionReader(docs: try drillDocs())
        let gate = ReadGate()
        reader.holdNextRead = gate
        let m = model(backend, reader)
        let resume = Task { await m.trySignIn() }
        for _ in 0..<1000 where !gate.isWaiting { await Task.yield() }
        #expect(gate.isWaiting)
        backend.claims["team"] = .string("T2")
        await m.join(code: "ABCDEFGH", teamId: "T2", incidentId: "")
        #expect(m.mission?.teamId == "T2")
        gate.release()
        await resume.value
        #expect(m.mission?.teamId == "T2")
    }

    /// The journal keeps every report this phone made, but a mission shows and counts only its own
    /// incident's: a report from an earlier incident never lists under, or shifts, the new one.
    @Test func aMissionUsesOnlyItsOwnIncidentsReports() async throws {
        func event(_ incident: String, _ seq: Int) -> EventDoc {
            EventDoc(eventId: EventID.make(incidentId: incident, deviceId: "uid-1", seq: seq), schemaVersion: 1, incidentId: incident,
                     teamId: "T1", deviceId: "uid-1", seq: seq, authorUid: "uid-1", role: .searcher, type: .clue, reporter: .searcher,
                     clientTimeMs: 1_000, serverTime: nil, observedAtMs: nil, position: nil, positionSource: .none, rawText: "x",
                     inputMethod: .typed, isTrainingInject: false, reading: nil, effect: .none(why: .needsCommand), route: nil,
                     targetEventId: nil, decision: nil, planVersion: nil, priorVersion: 1)
        }
        let m = model(FakeJoinBackend(), FakeMissionReader(docs: try drillDocs()))
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("scope-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir))
        try store.append(event("old-incident", 1))
        try store.append(event("drill-dev-1", 2))
        #expect(m.missionEntries.isEmpty)
        await m.loadMission(incidentId: "drill-dev-1", teamId: "T1")
        #expect(m.missionEntries.map(\.doc.incidentId) == ["drill-dev-1"] && store.entries.count == 2)
    }

    @Test func loadingAnotherMissionStopsTheOldPlanListener() async throws {
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(FakeJoinBackend(), reader)
        await m.loadMission(incidentId: "drill-dev-1", teamId: "T1")
        await m.loadMission(incidentId: "drill-dev-2", teamId: "T1")
        #expect(reader.watching == ["drill-dev-1", "drill-dev-2"] && reader.stops == 1)
    }

    /// A phone not yet in the incident: the callable sets its claims.
    func newcomer() -> FakeJoinBackend {
        let backend = FakeJoinBackend()
        backend.claimsAfterJoin = backend.claims
        backend.claims = [:]
        return backend
    }

    @Test func joiningLoadsTheTeamsMission() async throws {
        let reader = FakeMissionReader(docs: try drillDocs())
        let backend = newcomer()
        let m = model(backend, reader)
        await m.join(code: "abcd-efgh", teamId: "T1", incidentId: "")
        #expect(m.joinMessage == nil && reader.reads == ["drill-dev-1"] && backend.steps.contains("call"))
        #expect(m.mission?.incidentId == "drill-dev-1" && m.mission?.teamId == "T1" && m.mission?.assignment?.taskText == "Walk the creek bank.")
    }

    @Test func aJoinThatCannotWorkSaysSoAndLoadsNothing() async throws {
        let backend = newcomer()
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(backend, reader)
        await m.join(code: "ABC", teamId: "T1", incidentId: "")
        #expect(m.joinMessage == SearcherJoin.InputError.code.message && backend.steps.isEmpty)
        backend.reply = .failure(.tooMany)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(m.joinMessage == Joiner.tooMany && m.mission == nil && reader.reads.isEmpty)
    }

    @Test func aMissionThatCannotBeReadSaysWhy() async throws {
        let closed = model(FakeJoinBackend(), FakeMissionReader(docs: try drillDocs(status: "found")))
        await closed.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(closed.joinMessage == MissionBuilder.Failure.notOpen.message && closed.mission == nil)
        let offline = model(FakeJoinBackend(), FakeMissionReader(docs: nil))
        await offline.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(offline.joinMessage == AppModel.missionUnread && offline.mission == nil)
    }

    @Test func aSearcherWhoJoinedBeforeGetsTheMissionBackAfterSignIn() async throws {
        let backend = FakeJoinBackend()
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(backend, reader)
        await m.trySignIn()
        #expect(m.mission?.incidentId == "drill-dev-1" && m.mission?.teamId == "T1")
        // Signing in again does not read it again.
        await m.trySignIn()
        #expect(reader.reads == ["drill-dev-1"])
        // A token with no searcher claims loads nothing.
        let family = FakeJoinBackend()
        family.claims = ["inc": .string("drill-dev-1"), "role": .string("family")]
        let other = model(family, FakeMissionReader(docs: try drillDocs()))
        await other.trySignIn()
        #expect(other.mission == nil)
    }
}
