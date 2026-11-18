import FirebaseFirestore
import Foundation
import Observation
import PLSCore

/// The server side of event delivery, so the Outbox state machine can be tested without
/// Firestore. Completions run on the main actor.
@MainActor
protocol EventServer: AnyObject {
    /// Starts the write; the completion is the write's callback (it does not run while offline).
    func write(_ doc: EventDoc, completion: @escaping @MainActor ((any Error)?) -> Void)
    /// Reads the event back from the server and classifies what it found.
    func readBack(_ doc: EventDoc, completion: @escaping @MainActor (ServerCopy) -> Void)
}

/// Firestore: `incidents/{incidentId}/events/{eventId}`, written with `setData` and never awaited.
@MainActor
final class FirestoreEventServer: EventServer {
    private let db: Firestore

    init(db: Firestore) { self.db = db }

    private func ref(_ doc: EventDoc) -> DocumentReference {
        db.collection("incidents").document(doc.incidentId).collection("events").document(doc.eventId)
    }

    func write(_ doc: EventDoc, completion: @escaping @MainActor ((any Error)?) -> Void) {
        let data: [String: Any]
        do { data = try EventStore.payload(for: doc) } catch { completion(error); return }
        ref(doc).setData(data) { error in
            Task { @MainActor in completion(error) }
        }
    }

    func readBack(_ doc: EventDoc, completion: @escaping @MainActor (ServerCopy) -> Void) {
        ref(doc).getDocument(source: .server) { snapshot, error in
            let copy: ServerCopy
            if error != nil {
                copy = .unknownOffline
            } else {
                copy = ServerCopy.fromServerRead(local: doc.identity, exists: snapshot?.exists ?? false,
                                                 hasPendingWrites: snapshot?.metadata.hasPendingWrites ?? false,
                                                 server: snapshot?.data().flatMap(EventStore.identity(from:)))
            }
            Task { @MainActor in completion(copy) }
        }
    }
}

/// Writes this phone's events and keeps the Outbox journal true. Success marks an entry
/// delivered; an error reads the event back from the server first. After a restart, on
/// reconnect and on return to the foreground, unresolved entries are settled from the server:
/// our own still-queued write and no answer leave them as they are; an event the server does not
/// hold and Firestore no longer queues becomes "Not delivered" and retryable.
@MainActor
@Observable
final class EventStore {
    enum RetryResult: Equatable { case resent, settled, offline, notRetryable }

    private(set) var entries: [OutboxEntry]
    private(set) var journalProblem: String?
    private var outbox: Outbox
    private let server: EventServer

    init(server: EventServer, outboxURL: URL) throws {
        let box = try Outbox(fileURL: outboxURL)
        self.server = server
        self.outbox = box
        self.entries = box.entries
    }

    /// Journals the event, then starts the write. Not async: the UI never waits for the server.
    func append(_ doc: EventDoc) throws {
        try outbox.add(doc)
        entries = outbox.entries
        send(doc)
    }

    /// The person pressed Retry on a "Not delivered" entry. Reads back first, so it never
    /// rewrites a document that exists; with no answer the entry stays retryable.
    @discardableResult
    func retry(_ eventId: String) -> RetryResult {
        guard let doc = outbox.retryable().first(where: { $0.eventId == eventId }) else { return .notRetryable }
        var result = RetryResult.offline
        server.readBack(doc) { [weak self] copy in
            guard let self else { return }
            switch copy {
            case .absent:
                self.apply { try $0.markRetrying(eventId) }
                result = .resent
                self.send(doc)
            case .sameIdentity, .differentIdentity:
                self.apply { try $0.resolveFailure(eventId, error: "retry", serverCopy: copy) }
                result = .settled
            case .unknownOffline, .stillQueued:
                result = .offline                           // keep it rejected with its reason
            }
        }
        return result
    }

    /// Settles entries with no answer yet (pending or checking) from the server.
    func reconcileUnresolved() {
        for doc in outbox.unresolved() {
            server.readBack(doc) { [weak self] copy in
                guard let self else { return }
                switch copy {
                case .sameIdentity, .differentIdentity:
                    self.apply { try $0.resolveFailure(doc.eventId, error: "reconciled", serverCopy: copy) }
                case .absent:
                    self.apply { try $0.resolveFailure(doc.eventId, error: "not-on-server", serverCopy: .absent) }
                case .unknownOffline, .stillQueued:
                    break
                }
            }
        }
    }

    private func send(_ doc: EventDoc) {
        server.write(doc) { [weak self] error in self?.writeFinished(doc, error: error) }
    }

    private func writeFinished(_ doc: EventDoc, error: (any Error)?) {
        guard let error else {
            apply { try $0.markAcked(doc.eventId) }
            return
        }
        let label = Self.label(for: error)
        server.readBack(doc) { [weak self] copy in
            self?.apply { try $0.resolveFailure(doc.eventId, error: label, serverCopy: copy) }
        }
    }

    /// Runs one journal change; a disk error is shown, never swallowed.
    private func apply(_ change: (inout Outbox) throws -> Void) {
        do {
            try change(&outbox)
            journalProblem = nil
        } catch {
            journalProblem = "This phone could not save a report's delivery state."
        }
        entries = outbox.entries
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

    nonisolated static func label(for error: any Error) -> String {
        let ns = error as NSError
        guard ns.domain == FirestoreErrorDomain || ns.domain == "FIRFirestoreErrorDomain" else {
            return error is PayloadError ? "encode-failed" : "unknown"
        }
        switch FirestoreErrorCode.Code(rawValue: ns.code) {
        case .permissionDenied?: return "permission-denied"
        case .unavailable?: return "unavailable"
        case .deadlineExceeded?: return "deadline-exceeded"
        case .unauthenticated?: return "unauthenticated"
        case .invalidArgument?: return "invalid-argument"
        default: return "error-\(ns.code)"
        }
    }
}
