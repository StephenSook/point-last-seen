import Foundation
import Testing
@testable import PLSCore

private func tempFile() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json")
}
private let e1 = doc("00000000000000000000000000000001", .cleared, effect: clearAC)
private let e2 = doc("00000000000000000000000000000002", .clue, effect: clue(.high))

@Suite struct OutboxTests {
    @Test func rejectedStaysVisibleAndRetryable() throws {
        let url = tempFile()
        var box = try Outbox(fileURL: url)
        try box.add(e1); try box.add(e2)
        try box.markAcked(e1.eventId)
        try box.resolveFailure(e2.eventId, error: "permission-denied", serverCopy: .absent)
        let reopened = try Outbox(fileURL: url)
        #expect(reopened.entries.map(\.state) == [.acked, .rejected(reason: "permission-denied")])
        #expect(reopened.retryable().map(\.eventId) == [e2.eventId])
    }

    @Test func deniedWriteThatExistsOnServerIsAcknowledged() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1)
        try box.resolveFailure(e1.eventId, error: "permission-denied", serverCopy: .sameIdentity)
        #expect(box.entries[0].state == .acked)
    }

    @Test func conflictingServerCopyIsRejectedAsConflict() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1)
        try box.resolveFailure(e1.eventId, error: "permission-denied", serverCopy: .differentIdentity)
        #expect(box.entries[0].state == .rejected(reason: "id-conflict"))
        #expect(box.retryable().isEmpty)      // a retry would hit the same id again
    }

    @Test func offlineFailureWaitsAsChecking() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1)
        try box.resolveFailure(e1.eventId, error: "unavailable", serverCopy: .unknownOffline)
        #expect(box.entries[0].state == .checking)
        #expect(box.unresolved().map(\.eventId) == [e1.eventId])
    }

    @Test func addingTheSameEventTwiceKeepsOneEntry() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1); try box.add(e1)
        #expect(box.entries.count == 1)
    }

    @Test func anAcknowledgedEntryNeverGoesBack() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1)
        try box.markAcked(e1.eventId)
        try box.resolveFailure(e1.eventId, error: "unavailable", serverCopy: .unknownOffline)
        #expect(box.entries[0].state == .acked)
    }

    @Test func retryMovesARejectedEntryBackToPending() throws {
        var box = try Outbox(fileURL: tempFile())
        try box.add(e1)
        try box.resolveFailure(e1.eventId, error: "permission-denied", serverCopy: .absent)
        try box.markRetrying(e1.eventId)
        #expect(box.entries[0].state == .pending)
    }

    @Test func aMissingFileIsAnEmptyOutboxAndACorruptOneThrows() throws {
        #expect(try Outbox(fileURL: tempFile()).entries.isEmpty)
        let bad = tempFile()
        try Data("not json".utf8).write(to: bad)
        #expect(throws: (any Error).self) { try Outbox(fileURL: bad) }
    }

    @Test func serverCopyComparesTheWritersIdentity() {
        #expect(ServerCopy.compare(local: e1.identity, server: e1.identity) == .sameIdentity)
        #expect(ServerCopy.compare(local: e1.identity, server: nil) == .absent)
        var other = e1.identity; other.authorUid = "someone-else"
        #expect(ServerCopy.compare(local: e1.identity, server: other) == .differentIdentity)
    }
}

@Suite struct OutboxDiskFirstTests {
    /// A plain file where the journal's folder should be makes every write fail.
    func blockedURL() throws -> (url: URL, blocker: URL) {
        let blocker = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-block-\(UUID().uuidString)")
        try Data("x".utf8).write(to: blocker)
        return (blocker.appendingPathComponent("outbox.json"), blocker)
    }

    @Test func aFailedAddLeavesNothingInMemorySoTheRetryWrites() throws {
        let (url, blocker) = try blockedURL()
        var box = try Outbox(fileURL: url)
        #expect(throws: (any Error).self) { try box.add(e1) }
        #expect(box.entries.isEmpty)
        try FileManager.default.removeItem(at: blocker)
        try box.add(e1)
        #expect(try Outbox(fileURL: url).entries.map(\.eventId) == [e1.eventId])
    }

    @Test func aFailedStateChangeKeepsTheOldStateInMemory() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-dir-\(UUID().uuidString)")
        let url = dir.appendingPathComponent("outbox.json")
        var box = try Outbox(fileURL: url)
        try box.add(e1)
        try FileManager.default.removeItem(at: dir)
        try Data("x".utf8).write(to: dir)                          // now a file blocks the folder
        #expect(throws: (any Error).self) { try box.markAcked(e1.eventId) }
        #expect(box.entries[0].state == .pending)
        try FileManager.default.removeItem(at: dir)
        try box.markAcked(e1.eventId)
        #expect(try Outbox(fileURL: url).entries[0].state == .acked)
    }
}

@Suite struct OutboxConflictTests {
    @Test func aDifferentEventUnderAnExistingIdIsAConflict() throws {
        var box = try Outbox(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json"))
        try box.add(e1)
        try box.markAcked(e1.eventId)
        var other = e1
        other.clientTimeMs += 5_000
        #expect(throws: Outbox.Conflict.self) { try box.add(other) }
        #expect(box.entries.count == 1)
        #expect(box.entries[0].doc == e1)
        try box.add(e1)                                     // the identical event is an idempotent retry
        #expect(box.entries.count == 1)
    }
}

@Suite struct QueuedWriteReadBackTests {
    @Test func aQueuedWriteSeenThroughTheLocalViewIsNotADelivery() {
        // Firestore answers a server-source get through its local view, so our own queued write
        // can come back with our identity while the server has not taken it yet.
        #expect(ServerCopy.fromServerRead(local: e1.identity, exists: true, hasPendingWrites: true, server: e1.identity) == .stillQueued)
        #expect(ServerCopy.fromServerRead(local: e1.identity, exists: true, hasPendingWrites: false, server: e1.identity) == .sameIdentity)
        #expect(ServerCopy.fromServerRead(local: e1.identity, exists: false, hasPendingWrites: false, server: nil) == .absent)
        var other = e1.identity; other.seq += 1
        #expect(ServerCopy.fromServerRead(local: e1.identity, exists: true, hasPendingWrites: false, server: other) == .differentIdentity)
    }

    @Test func aStillQueuedAnswerLeavesTheEntryAsItWas() throws {
        var box = try Outbox(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json"))
        try box.add(e1)
        try box.resolveFailure(e1.eventId, error: "reconcile", serverCopy: .stillQueued)
        #expect(box.entries[0].state == .pending)
        #expect(box.entries[0].lastError == nil)
    }
}

@Suite struct OutboxRecoveryTests {
    @Test func aDamagedJournalIsMovedAsideAndANewOneStarts() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-rec-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("outbox.json")
        try Data("not json".utf8).write(to: url)
        let (box, movedTo) = try Outbox.openOrRecover(fileURL: url, nowMs: 1_795_860_000_000)
        #expect(box.entries.isEmpty)
        #expect(movedTo?.lastPathComponent == "outbox.damaged-1795860000000.json")
        #expect(try Data(contentsOf: movedTo!) == Data("not json".utf8))           // kept for command, not deleted
        var fresh = box
        try fresh.add(e1)
        #expect(try Outbox(fileURL: url).entries.count == 1)
    }

    @Test func aHealthyJournalOpensAsItIs() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json")
        var box = try Outbox(fileURL: url); try box.add(e1)
        let (again, movedTo) = try Outbox.openOrRecover(fileURL: url, nowMs: 1)
        #expect(again.entries.count == 1)
        #expect(movedTo == nil)
    }
}

@Suite struct OutboxRetryableReasonTests {
    @Test func onlyReasonsARetryCanFixAreRetryable() throws {
        #expect(Outbox.isRetryable(reason: "permission-denied"))
        #expect(Outbox.isRetryable(reason: "unavailable"))
        #expect(Outbox.isRetryable(reason: "not-on-server"))
        #expect(Outbox.isRetryable(reason: "invalid-argument") == false)
        #expect(Outbox.isRetryable(reason: "encode-failed") == false)
        #expect(Outbox.isRetryable(reason: Outbox.conflictReason) == false)
        var box = try Outbox(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json"))
        try box.add(e1); try box.add(e2)
        try box.resolveFailure(e1.eventId, error: "invalid-argument", serverCopy: .absent)
        try box.resolveFailure(e2.eventId, error: "unavailable", serverCopy: .absent)
        #expect(box.retryable().map(\.eventId) == [e2.eventId])
        #expect(EchoText.deliveryLine(.rejected(reason: "invalid-argument")) == "Not delivered. Ask command")
    }
}

