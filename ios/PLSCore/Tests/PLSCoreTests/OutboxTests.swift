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
