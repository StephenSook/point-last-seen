import Foundation

/// What the server holds for an event id, read back after a write error.
public enum ServerCopy: Sendable, Equatable {
    case sameIdentity
    case absent
    case differentIdentity
    case unknownOffline

    /// Compares the writer's identity (deviceId, seq, authorUid, clientTimeMs) with the server copy.
    public static func compare(local: EventIdentity, server: EventIdentity?) -> ServerCopy {
        guard let server else { return .absent }
        return server == local ? .sameIdentity : .differentIdentity
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

    public var eventId: String { doc.eventId }
}

/// A journal on disk of every event this phone made (spec section 6.2). The Firestore write's
/// completion callback updates it. Before a write is shown as rejected the phone reads the
/// event back from the server: a copy with the same identity means it was delivered.
public struct Outbox: Sendable {
    public static let conflictReason = "id-conflict"

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

    public mutating func add(_ doc: EventDoc) throws {
        guard !entries.contains(where: { $0.eventId == doc.eventId }) else { return }
        entries.append(OutboxEntry(doc: doc, state: .pending, lastError: nil))
        try save()
    }

    public mutating func markAcked(_ eventId: String) throws {
        try update(eventId) { $0.state = .acked; $0.lastError = nil }
    }

    /// Decides a failed write after the server read-back. An acknowledged entry never goes back.
    public mutating func resolveFailure(_ eventId: String, error: String, serverCopy: ServerCopy) throws {
        try update(eventId) { e in
            guard e.state != .acked else { return }
            e.lastError = error
            switch serverCopy {
            case .sameIdentity: e.state = .acked
            case .absent: e.state = .rejected(reason: error)
            case .differentIdentity: e.state = .rejected(reason: Self.conflictReason)
            case .unknownOffline: e.state = .checking
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

    /// Rejected writes the person may retry. An id conflict is not retryable: the same id
    /// would hit the other document again.
    public func retryable() -> [EventDoc] {
        entries.filter { if case let .rejected(reason) = $0.state { reason != Self.conflictReason } else { false } }.map(\.doc)
    }

    /// Writes with no final answer yet (pending or checking), to read back when online.
    public func unresolved() -> [EventDoc] {
        entries.filter { $0.state == .pending || $0.state == .checking }.map(\.doc)
    }

    mutating func update(_ eventId: String, _ change: (inout OutboxEntry) -> Void) throws {
        guard let i = entries.firstIndex(where: { $0.eventId == eventId }) else { return }
        change(&entries[i])
        try save()
    }

    func save() throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(entries).write(to: fileURL, options: .atomic)
    }
}
