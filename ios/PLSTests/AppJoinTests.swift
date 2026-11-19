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

    @Test func loadingAnotherMissionStopsTheOldPlanListener() async throws {
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(FakeJoinBackend(), reader)
        await m.loadMission(incidentId: "drill-dev-1", teamId: "T1")
        await m.loadMission(incidentId: "drill-dev-2", teamId: "T1")
        #expect(reader.watching == ["drill-dev-1", "drill-dev-2"] && reader.stops == 1)
    }

    @Test func joiningLoadsTheTeamsMission() async throws {
        let reader = FakeMissionReader(docs: try drillDocs())
        let m = model(FakeJoinBackend(), reader)
        await m.join(code: "abcd-efgh", teamId: "T1", incidentId: "")
        #expect(m.joinMessage == nil && reader.reads == ["drill-dev-1"])
        #expect(m.mission?.incidentId == "drill-dev-1" && m.mission?.teamId == "T1" && m.mission?.assignment?.taskText == "Walk the creek bank.")
    }

    @Test func aJoinThatCannotWorkSaysSoAndLoadsNothing() async throws {
        let backend = FakeJoinBackend()
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
