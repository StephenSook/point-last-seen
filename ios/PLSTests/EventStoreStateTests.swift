import Foundation
import PLSCore
import Testing
@testable import PLS

/// A scripted server: each write and read-back answers from a queue, immediately.
@MainActor
final class FakeEventServer: EventServer {
    var writeErrors: [(any Error)?] = []
    var readBacks: [ServerCopy] = []
    /// Offline: writes start but their callback never runs.
    var holdWrites = false
    private(set) var writes: [String] = []
    private(set) var listenedTo: [String] = []
    private var onSnapshot: (@MainActor ([ServerEventCopy]) -> Void)?

    func write(_ doc: EventDoc, completion: @escaping @MainActor ((any Error)?) -> Void) {
        writes.append(doc.eventId)
        if holdWrites { return }
        completion(writeErrors.isEmpty ? nil : writeErrors.removeFirst())
    }

    func listen(incidentId: String, onSnapshot: @escaping @MainActor ([ServerEventCopy]) -> Void) -> AnyObject? {
        listenedTo.append(incidentId)
        self.onSnapshot = onSnapshot
        return nil
    }

    @MainActor func push(_ docs: [(JSONValue, Bool)]) {
        onSnapshot?(docs.map { ServerEventCopy(data: $0.0, hasPendingWrites: $0.1) })
    }

    func readBack(_ doc: EventDoc, completion: @escaping @MainActor (ServerCopy) -> Void) {
        completion(readBacks.isEmpty ? .unknownOffline : readBacks.removeFirst())
    }
}

@MainActor
@Suite struct EventStoreStateTests {
    let denied = NSError(domain: "FIRFirestoreErrorDomain", code: 7)
    func url() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json") }
    func event(_ seq: Int) -> EventDoc {
        EventDoc(eventId: EventID.make(incidentId: "I1", deviceId: "uid-1", seq: seq), schemaVersion: 1, incidentId: "I1", teamId: "T1",
                 deviceId: "uid-1", seq: seq, authorUid: "uid-1", role: .searcher, type: .clue, reporter: .searcher, clientTimeMs: 1_000,
                 serverTime: nil, observedAtMs: nil, position: nil, positionSource: .none, rawText: "x", inputMethod: .typed,
                 isTrainingInject: false, reading: nil, effect: .none(why: .needsCommand), route: nil, targetEventId: nil,
                 decision: nil, planVersion: nil, priorVersion: 1)
    }

    @Test func aWriteThatLandsIsDelivered() throws {
        let server = FakeEventServer()
        let store = try EventStore(server: server, outboxURL: url())
        try store.append(event(1))
        #expect(store.entries.map(\.state) == [.acked])
    }

    @Test func aDeniedWriteAbsentOnTheServerIsRetryable() throws {
        let server = FakeEventServer(); server.writeErrors = [denied]; server.readBacks = [.absent]
        let store = try EventStore(server: server, outboxURL: url())
        try store.append(event(1))
        #expect(store.entries[0].state == .rejected(reason: "permission-denied"))
    }

    @Test func afterARestartAnEntryThatNeverReachedTheServerBecomesRetryable() throws {
        let u = url()
        var box = try Outbox(fileURL: u); try box.add(event(1)); try box.add(event(2)); try box.add(event(3)); try box.add(event(4))
        let server = FakeEventServer(); server.readBacks = [.absent, .stillQueued, .unknownOffline, .sameIdentity]
        let store = try EventStore(server: server, outboxURL: u)
        store.reconcileUnresolved()
        #expect(store.entries.map(\.state) == [.rejected(reason: "not-on-server"), .pending, .pending, .acked])
        #expect(server.writes.isEmpty)
    }

    @Test func aRetryWhileOfflineStaysRetryableWithItsReason() throws {
        let server = FakeEventServer(); server.writeErrors = [denied]; server.readBacks = [.absent, .unknownOffline]
        let store = try EventStore(server: server, outboxURL: url())
        let e = event(1)
        try store.append(e)
        let result = store.retry(e.eventId)
        #expect(result == .offline)
        #expect(store.entries[0].state == .rejected(reason: "permission-denied"))
    }

    @Test func aRetryOfAnAbsentEntryWritesItAgain() throws {
        let server = FakeEventServer(); server.writeErrors = [denied, nil]; server.readBacks = [.absent, .absent]
        let store = try EventStore(server: server, outboxURL: url())
        let e = event(1)
        try store.append(e)
        #expect(store.retry(e.eventId) == .resent)
        #expect(server.writes == [e.eventId, e.eventId])
        #expect(store.entries[0].state == .acked)
    }
}
