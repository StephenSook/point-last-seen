import Foundation
import PLSCore
import Testing
@testable import PLS

/// Undo (5 seconds) is a new `retraction` event that targets the report; events are never edited.
@MainActor
@Suite struct UndoTests {
    final class Clock { var ms: Double = 1_000_000 }

    func setUp() throws -> (AppModel, EventStore, Clock, EventDoc) {
        let clock = Clock()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, nowMs: { clock.ms })
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("undo-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir))
        let report = EventDoc(eventId: EventID.make(incidentId: "I1", deviceId: "uid-1", seq: 1), schemaVersion: 1, incidentId: "I1", teamId: "T1",
                              deviceId: "uid-1", seq: 1, authorUid: "uid-1", role: .searcher, type: .cleared, reporter: .searcher,
                              clientTimeMs: clock.ms, serverTime: nil, observedAtMs: nil, position: nil, positionSource: .none,
                              rawText: "cleared AC", inputMethod: .typed, isTrainingInject: false, reading: nil,
                              effect: .none(why: .needsCommand), route: nil, targetEventId: nil, decision: nil, planVersion: nil, priorVersion: 1)
        try store.append(report)
        return (model, store, clock, report)
    }

    @Test func undoWithinFiveSecondsJournalsARetraction() throws {
        let (model, store, clock, report) = try setUp()
        clock.ms += 4_000
        #expect(model.canUndo(report.eventId))
        model.undo(report.eventId)
        let last = try #require(store.entries.last?.doc)
        #expect(last.type == .retraction && last.targetEventId == report.eventId && last.deviceId == "uid-1" && last.authorUid == "uid-1")
        #expect(!model.canUndo(report.eventId))                       // undone once
        #expect(!model.canUndo(last.eventId))                         // a retraction has no undo
    }

    @Test func noUndoAfterFiveSeconds() throws {
        let (model, store, clock, report) = try setUp()
        clock.ms += 5_001
        #expect(!model.canUndo(report.eventId))
        model.undo(report.eventId)
        #expect(store.entries.count == 1)
    }
}
