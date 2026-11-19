import Foundation
import PLSCore
import Testing
@testable import PLS

/// Serves the drill incident's documents, or fails as the network does.
final class FakeMissionReader: MissionReader, @unchecked Sendable {
    var docs: MissionDocs?
    private(set) var reads: [String] = []
    init(docs: MissionDocs?) { self.docs = docs }
    func read(incidentId: String) async throws -> MissionDocs {
        reads.append(incidentId)
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

    func model(_ backend: FakeJoinBackend, _ reader: FakeMissionReader) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                 speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }),
                 joinBackend: backend, missionReader: reader)
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
