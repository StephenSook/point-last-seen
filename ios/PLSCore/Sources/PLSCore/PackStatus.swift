import Foundation

/// What a pack carries about itself (bundle `{incidentId}-{teamId}-v{n}`).
public struct PackInfo: Codable, Sendable, Equatable {
    public var packVersion: Int
    public var priorVersion: Int
    public var eventSetHash: String

    public init(packVersion: Int, priorVersion: Int, eventSetHash: String) {
        self.packVersion = packVersion
        self.priorVersion = priorVersion
        self.eventSetHash = eventSetHash
    }
}

/// The Ready check's pack line. New events alone never make a pack stale: they sync on their own.
public enum PackStatus: Equatable, Sendable {
    case notPacked
    case current
    case stale(reason: String)

    /// `remote` is the command post's `packs/{teamId}` doc, or nil when the phone cannot see it.
    public static func evaluate(local: PackInfo?, remote: PackInfo?) -> PackStatus {
        guard let local else { return .notPacked }
        guard let remote else { return .current }
        if remote.priorVersion > local.priorVersion {
            return .stale(reason: "prior v\(remote.priorVersion) at command, v\(local.priorVersion) on this phone")
        }
        if remote.packVersion > local.packVersion {
            return .stale(reason: "pack v\(remote.packVersion) at command, v\(local.packVersion) on this phone")
        }
        return .current
    }
}

/// Server time minus device time, measured when the pack loads online.
public enum ClockOffset {
    public static func compute(serverMs: Int64, deviceMs: Int64) -> Int {
        Int(serverMs - deviceMs)
    }

    /// Reads an HTTP `Date` header (RFC 7231 IMF-fixdate) as milliseconds since 1970.
    public static func serverMs(httpDate: String) -> Int64? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let date = f.date(from: httpDate) else { return nil }
        return Int64((date.timeIntervalSince1970 * 1000).rounded())
    }
}
