import FirebaseFirestore
import Foundation
import Observation
import PLSCore

/// Writes this phone's events to `incidents/{incidentId}/events/{eventId}` and keeps the Outbox
/// journal true. A write is never awaited (its completion does not run while offline); the
/// callback updates the journal. Before a write is shown as rejected the event is read back
/// from the server: a copy with the same identity means it was delivered.
@MainActor
@Observable
final class EventStore {
    private(set) var entries: [OutboxEntry]
    private var outbox: Outbox
    private let db: Firestore

    init(db: Firestore, outboxURL: URL) throws {
        let box = try Outbox(fileURL: outboxURL)
        self.db = db
        self.outbox = box
        self.entries = box.entries
    }

    /// Journals the event, then starts the write. Not async: the UI never waits for the server.
    func append(_ doc: EventDoc) throws {
        try outbox.add(doc)
        entries = outbox.entries
        write(doc)
    }

    /// The person pressed Retry on a "Not delivered" entry. Reads back first, so it never
    /// rewrites a document that exists.
    func retry(_ eventId: String) {
        guard let doc = outbox.retryable().first(where: { $0.eventId == eventId }) else { return }
        readBack(doc) { [weak self] copy in
            guard let self else { return }
            switch copy {
            case .absent:
                try? self.outbox.markRetrying(eventId)
                self.entries = self.outbox.entries
                self.write(doc)
            default:
                try? self.outbox.resolveFailure(eventId, error: "retry", serverCopy: copy)
                self.entries = self.outbox.entries
            }
        }
    }

    /// After a restart or a reconnect: entries with no answer yet are settled from the server.
    /// An absent one is left pending, because Firestore may still hold it in its own write queue.
    func reconcileUnresolved() {
        for doc in outbox.unresolved() {
            readBack(doc) { [weak self] copy in
                guard let self, copy == .sameIdentity || copy == .differentIdentity else { return }
                try? self.outbox.resolveFailure(doc.eventId, error: "reconciled", serverCopy: copy)
                self.entries = self.outbox.entries
            }
        }
    }

    private func ref(_ doc: EventDoc) -> DocumentReference {
        db.collection("incidents").document(doc.incidentId).collection("events").document(doc.eventId)
    }

    private func write(_ doc: EventDoc) {
        guard let data = try? Self.payload(for: doc) else { return }
        ref(doc).setData(data) { [weak self] error in
            Task { @MainActor in self?.writeFinished(doc, error: error) }
        }
    }

    private func writeFinished(_ doc: EventDoc, error: (any Error)?) {
        guard let error else {
            try? outbox.markAcked(doc.eventId)
            entries = outbox.entries
            return
        }
        let code = (error as NSError).domain == FirestoreErrorDomain ? FirestoreErrorCode.Code(rawValue: (error as NSError).code) : nil
        let label = code.map(Self.label) ?? "unknown"
        readBack(doc) { [weak self] copy in
            guard let self else { return }
            try? self.outbox.resolveFailure(doc.eventId, error: label, serverCopy: copy)
            self.entries = self.outbox.entries
        }
    }

    private func readBack(_ doc: EventDoc, _ done: @escaping @MainActor (ServerCopy) -> Void) {
        ref(doc).getDocument(source: .server) { snapshot, error in
            let copy: ServerCopy
            if error != nil {
                copy = .unknownOffline
            } else {
                copy = ServerCopy.fromServerRead(local: doc.identity, exists: snapshot?.exists ?? false,
                                                 hasPendingWrites: snapshot?.metadata.hasPendingWrites ?? false,
                                                 server: snapshot?.data().flatMap(Self.identity(from:)))
            }
            Task { @MainActor in done(copy) }
        }
    }

    /// The Firestore document for an event: all 25 keys, whole numbers as integers, and the
    /// server timestamp in `serverTime` (the create rule requires `serverTime == request.time`).
    nonisolated static func payload(for doc: EventDoc) throws -> [String: Any] {
        guard var data = try JSONValue(encoding: doc).firestoreValue as? [String: Any] else { throw PayloadError.notAnObject }
        data["serverTime"] = FieldValue.serverTimestamp()
        return data
    }

    nonisolated static func identity(from data: [String: Any]) -> EventIdentity? {
        guard let deviceId = data["deviceId"] as? String, let seq = (data["seq"] as? NSNumber)?.intValue,
              let authorUid = data["authorUid"] as? String, let client = (data["clientTimeMs"] as? NSNumber)?.doubleValue else { return nil }
        return EventIdentity(deviceId: deviceId, seq: seq, authorUid: authorUid, clientTimeMs: client)
    }

    enum PayloadError: Error { case notAnObject }

    nonisolated static func label(_ code: FirestoreErrorCode.Code) -> String {
        switch code {
        case .permissionDenied: return "permission-denied"
        case .unavailable: return "unavailable"
        case .deadlineExceeded: return "deadline-exceeded"
        case .unauthenticated: return "unauthenticated"
        case .invalidArgument: return "invalid-argument"
        default: return "error-\(code.rawValue)"
        }
    }
}
