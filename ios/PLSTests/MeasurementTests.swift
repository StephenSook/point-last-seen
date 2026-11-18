import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
final class FakeMeasurementWriter: MeasurementWriter {
    var written: [(path: String, m: ReadMeasurement)] = []
    func write(_ m: ReadMeasurement, path: String) { written.append((path, m)) }
}

/// Each report's three timings go to the device's own measurements document (the event is
/// never updated): Send, reading done, and the recomputed posterior.
@MainActor
@Suite struct MeasurementTests {
    @Test func aSentReportWritesItsTimingsAndRecomputesThePosterior() async throws {
        final class Clock { var ms: Double = 1_000_000; func tick() -> Double { ms += 10; return ms } }
        let clock = Clock()
        let writer = FakeMeasurementWriter()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, nowMs: { clock.tick() },
                             measurements: writer)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("meas-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        let mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
        await model.load(mission)

        let left = await model.submit("there is blood on a rock by the creek", inputMethod: .typed)
        #expect(left == "")
        let event = try #require(store.entries.last?.doc)
        #expect(writer.written.count == 1)
        let w = try #require(writer.written.first)
        #expect(w.path == ReadMeasurement.path(incidentId: "I1", teamId: "T1", deviceId: "uid-1", eventId: event.eventId))
        #expect(w.m.submittedAtMs < w.m.readDoneAtMs && w.m.readDoneAtMs < w.m.redrawnAtMs)
        #expect(model.posterior != nil)
    }
}
