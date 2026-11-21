import Foundation

/// What the server holds for an event id, read back after a write error.
public enum ServerCopy: Sendable, Equatable {
    case sameIdentity
    case absent
    case differentIdentity
    case unknownOffline
    /// The read saw our own write still waiting in Firestore's local queue: no server answer yet.
    case stillQueued

    /// Compares the writer's identity (deviceId, seq, authorUid, clientTimeMs) with the server copy.
    public static func compare(local: EventIdentity, server: EventIdentity?) -> ServerCopy {
        guard let server else { return .absent }
        return server == local ? .sameIdentity : .differentIdentity
    }

    /// Reads a server-source get. Firestore answers it through its local view, so a snapshot
    /// with pending writes is our own queued event, not proof the server took it.
    public static func fromServerRead(local: EventIdentity, exists: Bool, hasPendingWrites: Bool, server: EventIdentity?) -> ServerCopy {
        guard exists else { return .absent }
        if hasPendingWrites { return .stillQueued }
        return compare(local: local, server: server)
    }
}

public enum OutboxState: Sendable, Equatable, Codable {
    case pending
    case checking
    case acked
    case rejected(reason: String)

    enum CodingKeys: String, CodingKey { case state, reason }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .state) {
        case "pending": self = .pending
        case "checking": self = .checking
        case "acked": self = .acked
        case "rejected": self = .rejected(reason: try c.decode(String.self, forKey: .reason))
        case let other: throw DecodingError.dataCorruptedError(forKey: .state, in: c, debugDescription: "unknown state \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .pending: try c.encode("pending", forKey: .state)
        case .checking: try c.encode("checking", forKey: .state)
        case .acked: try c.encode("acked", forKey: .state)
        case let .rejected(reason):
            try c.encode("rejected", forKey: .state)
            try c.encode(reason, forKey: .reason)
        }
    }
}

public struct OutboxEntry: Sendable, Equatable, Codable {
    public var doc: EventDoc
    public var state: OutboxState
    public var lastError: String?
    /// The phone's own note for the receipt when a model's "found" was read as a clue; never part of the event.
    public var foundKindReason: String? = nil

    public var eventId: String { doc.eventId }
}

/// A journal on disk of every event this phone made (spec section 6.2). The Firestore write's
/// completion callback updates it. Before a write is shown as rejected the phone reads the
/// event back from the server: a copy with the same identity means it was delivered.
public struct Outbox: Sendable {
    public static let conflictReason = "id-conflict"

    /// A different event arrived under an id the journal already holds.
    public struct Conflict: Error, Equatable {
        public let eventId: String
    }

    public let fileURL: URL
    public private(set) var entries: [OutboxEntry]

    /// Opens the journal. A missing file is an empty journal; an unreadable one throws, so a
    /// damaged journal is never silently replaced.
    public init(fileURL: URL) throws {
        self.fileURL = fileURL
        if FileManager.default.fileExists(atPath: fileURL.path) {
            entries = try JSONDecoder().decode([OutboxEntry].self, from: Data(contentsOf: fileURL))
        } else {
            entries = []
        }
    }

    /// Opens the journal; if the file cannot be read, moves it aside as
    /// `outbox.damaged-{ms}.json` (kept, never deleted) and starts a new journal, so one damaged
    /// file never stops the phone from reporting. Returns where the damaged file went.
    public static func openOrRecover(fileURL: URL, nowMs: Int) throws -> (Outbox, URL?) {
        do {
            return (try Outbox(fileURL: fileURL), nil)
        } catch {
            let base = fileURL.deletingPathExtension().lastPathComponent
            let aside = fileURL.deletingLastPathComponent().appendingPathComponent("\(base).damaged-\(nowMs).json")
            try FileManager.default.moveItem(at: fileURL, to: aside)
            return (try Outbox(fileURL: fileURL), aside)
        }
    }

    /// Adds a new event. The identical event again is an idempotent retry; a different event
    /// under the same id throws `Conflict` and changes nothing.
    public mutating func add(_ doc: EventDoc, foundKindReason: String? = nil) throws {
        if let existing = entries.first(where: { $0.eventId == doc.eventId }) {
            guard existing.doc == doc else { throw Conflict(eventId: doc.eventId) }
            return
        }
        try commit(entries + [OutboxEntry(doc: doc, state: .pending, lastError: nil, foundKindReason: foundKindReason)])
    }

    public mutating func markAcked(_ eventId: String) throws {
        try update(eventId) { $0.state = .acked; $0.lastError = nil }
    }

    /// Decides a failed write after the server read-back. An acknowledged entry never goes back.
    public mutating func resolveFailure(_ eventId: String, error: String, serverCopy: ServerCopy) throws {
        guard serverCopy != .stillQueued else { return }       // still queued: leave the entry as it is
        try update(eventId) { e in
            guard e.state != .acked else { return }
            e.lastError = error
            switch serverCopy {
            case .sameIdentity: e.state = .acked
            case .absent: e.state = .rejected(reason: error)
            case .differentIdentity: e.state = .rejected(reason: Self.conflictReason)
            case .unknownOffline: e.state = .checking
            case .stillQueued: break
            }
        }
    }

    /// The person pressed Retry: the entry waits again while the write is re-sent.
    public mutating func markRetrying(_ eventId: String) throws {
        try update(eventId) { e in if case .rejected = e.state { e.state = .pending } }
    }

    public func state(of eventId: String) -> OutboxState? {
        entries.first { $0.eventId == eventId }?.state
    }

    /// Reasons a retry cannot fix: the same id would hit the other document again, or the
    /// server refuses this document's content every time. These ask command instead.
    public static let permanentReasons: Set<String> = [conflictReason, "invalid-argument", "encode-failed"]

    public static func isRetryable(reason: String) -> Bool { !permanentReasons.contains(reason) }

    /// Rejected writes the person may retry.
    public func retryable() -> [EventDoc] {
        entries.filter { if case let .rejected(reason) = $0.state { Self.isRetryable(reason: reason) } else { false } }.map(\.doc)
    }

    /// Writes with no final answer yet (pending or checking), to read back when online.
    public func unresolved() -> [EventDoc] {
        entries.filter { $0.state == .pending || $0.state == .checking }.map(\.doc)
    }

    mutating func update(_ eventId: String, _ change: (inout OutboxEntry) -> Void) throws {
        guard let i = entries.firstIndex(where: { $0.eventId == eventId }) else { return }
        var proposed = entries
        change(&proposed[i])
        try commit(proposed)
    }

    /// Disk first: the new entries become visible in memory only after the atomic write
    /// succeeds, so a failed write never looks like success to the next call.
    mutating func commit(_ proposed: [OutboxEntry]) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(proposed).write(to: fileURL, options: .atomic)
        entries = proposed
    }
}
