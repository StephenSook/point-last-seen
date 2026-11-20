import Foundation
import PLSCore
import Testing
@testable import PLS

/// The practice drill without a code: a bundled pack of sample search documents, loaded on the
/// phone with no join, labelled as practice, and with every report kept on the phone.
@MainActor
@Suite struct PracticeTests {
    /// A pack in the agreed format, from the drill fixtures.
    func packFile() throws -> URL {
        let segments = try DrillDocs.segments()
        let first = segments.compactMap { if case let .string(id)? = $0["segmentId"], id != "ROW" { id } else { nil } }.first ?? ""
        let pack: JSONValue = .object([
            "packVersion": .number(1), "teamId": .string("T1"),
            "provenance": .object(["tool": .string("test fixture"), "sourceIncidentId": .string("drill-dev-1")]),
            "incidentId": .string("practice-drill"),
            "incident": try DrillDocs.incident(), "segments": .array(segments),
            "plan": DrillDocs.plan(segmentIds: [first]), "sharedProfile": DrillDocs.shared,
        ])
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pack-\(UUID().uuidString).json")
        try JSONEncoder().encode(pack).write(to: url)
        return url
    }

    func tempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("practice-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func model(voice: FakeVoice = FakeVoice(), reader: FakeMissionReader, topics: FakePushTopics,
               backend: FakeJoinBackend = FakeJoinBackend(), measurements: FakeMeasurementWriter = FakeMeasurementWriter(),
               uid: String? = "uid-1") -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { uid != nil }, attempt: { uid != nil }),
                 speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }), uid: { uid },
                 measurements: measurements,
                 readReport: { text, _, _, _ in
                     let route = RouteRecord(platform: .ios, path: .rules, stage: .deterministicParser, model: "rules",
                                             reason: .notDrillMode, latencyMs: 2, sdkReported: false, blocked: nil, decidedAtMs: 0)
                     return ReadOutcome(reading: ReportReading.unclear(quote: text), route: route, validation: .ok)
                 },
                 joinBackend: backend, missionReader: reader, pushTopics: topics, alerts: FakeAlerts(),
                 defaults: UserDefaults(suiteName: "practice-\(UUID().uuidString)")!)
    }

    @Test func thePackReadsIntoTheSearchDocuments() throws {
        let pack = try PracticePack.load(from: try packFile())
        #expect(pack.teamId == "T1" && pack.provenance["tool"] == .string("test fixture") && pack.incidentId == "practice-drill")
        #expect(pack.docs.segments.count == (try DrillDocs.segments()).count && pack.docs.plan != nil)
        let bad = FileManager.default.temporaryDirectory.appendingPathComponent("pack-bad-\(UUID().uuidString).json")
        try Data(#"{"packVersion": 2, "provenance": {"tool": "x"}, "teamId": "T1", "incidentId": "p", "incident": {}, "segments": [{}]}"#.utf8).write(to: bad)
        #expect(throws: PracticePack.Failure.version) { try PracticePack.load(from: bad) }
    }

    /// Starting the drill reads nothing from the server, follows no topic and no plan listener, and
    /// the mission says it is practice, spoken without an account.
    @Test func startingThePracticeDrillUsesOnlyThePack() async throws {
        let reader = FakeMissionReader(docs: nil), topics = FakePushTopics(), voice = FakeVoice()
        let m = model(voice: voice, reader: reader, topics: topics)
        #expect(await m.startPractice(packURL: try packFile(), directory: try tempDir()) == nil)
        await m.speech?.value
        await m.topicFollow?.value
        #expect(m.mission?.isPractice == true && m.mission?.teamId == "T1")
        #expect(reader.reads.isEmpty && reader.watching.isEmpty && topics.ops.isEmpty)
        #expect(voice.spoken.count == 1)
    }

    /// A practice report is kept on this phone: the real journal, its server and the timings
    /// document never see it, and it needs no account (a phone that never signed in can run the practice drill).
    @Test func aPracticeReportNeverLeavesThePhone() async throws {
        let reader = FakeMissionReader(docs: nil), topics = FakePushTopics(), measurements = FakeMeasurementWriter()
        let m = model(reader: reader, topics: topics, measurements: measurements, uid: nil)
        let dir = try tempDir()
        let server = FakeEventServer()
        let store = try EventStore(server: server, outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        #expect(await m.startPractice(packURL: try packFile(), directory: try tempDir()) == nil)
        #expect(await m.submit("Found a blue coat by the creek", inputMethod: .typed) == "")
        #expect(server.writes.isEmpty && store.entries.isEmpty && measurements.written.isEmpty)
        #expect(m.missionEntries.count == 1 && m.missionEntries.first?.state == .pending)
        // Nothing is waiting to send: the link glyph never shows practice reports as on their way.
        #expect(m.linkState == LinkState.make(online: m.connectivity.isOnline, waiting: 0))
    }

    /// Signing in or coming back to signal never replaces the practice drill with a real mission.
    @Test func aSignInKeepsThePracticeDrill() async throws {
        let reader = FakeMissionReader(docs: nil), topics = FakePushTopics(), backend = FakeJoinBackend()
        let m = model(reader: reader, topics: topics, backend: backend)
        #expect(await m.startPractice(packURL: try packFile(), directory: try tempDir()) == nil)
        await m.trySignIn()
        #expect(m.mission?.isPractice == true && reader.reads.isEmpty)
        // A new user (Auth's listener after a sign-in) does not end it either.
        m.noteAccount("uid-2")
        #expect(m.mission?.isPractice == true)
    }

    /// While a search is joined there is no practice drill: it never replaces a real mission.
    @Test func aJoinedSearchIsNeverReplacedByPractice() async throws {
        let docs = MissionDocs(incident: try DrillDocs.incident(), segments: try DrillDocs.segments())
        let m = model(reader: FakeMissionReader(docs: docs), topics: FakePushTopics())
        // The searcher's claims name drill-dev-1 T1, so the sign-in loads that real mission.
        await m.trySignIn()
        #expect(m.mission?.isPractice == false && !m.canStartPractice)
        #expect(await m.startPractice(packURL: try packFile(), directory: try tempDir()) == nil)
        #expect(m.mission?.isPractice == false && m.mission?.incidentId == "drill-dev-1")
    }

    /// Leaving ends the practice drill on the phone: no sign-out, and the real journal is back.
    @Test func leavingEndsThePracticeDrill() async throws {
        final class Count: @unchecked Sendable { var signOuts = 0 }
        let count = Count()
        let reader = FakeMissionReader(docs: nil)
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }, signOut: { count.signOuts += 1 }),
                         speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }),
                         uid: { "uid-1" }, joinBackend: FakeJoinBackend(), missionReader: reader, pushTopics: FakePushTopics(),
                         alerts: FakeAlerts(), defaults: UserDefaults(suiteName: "practice-leave-\(UUID().uuidString)")!)
        let dir = try tempDir()
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir))
        #expect(await m.startPractice(packURL: try packFile(), directory: try tempDir()) == nil)
        #expect(await m.leaveSearch())
        #expect(m.mission == nil && count.signOuts == 0 && m.missionEntries.isEmpty)
    }
}
