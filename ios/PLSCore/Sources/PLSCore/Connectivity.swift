import Foundation

/// How the phone decides `networkOnline` for the router. The OS network path alone is not
/// enough: a phone can report a satisfied path (Wi-Fi joined, no internet) while every request
/// fails. So a network-class request failure counts as offline until a later success, or until
/// `holdMs` has passed, after which the path decides again.
public struct Connectivity: Sendable, Equatable {
    public let holdMs: Int64
    public private(set) var pathSatisfied = false
    public private(set) var lastFailureMs: Int64?

    public init(holdMs: Int64 = 60_000) {
        self.holdMs = holdMs
    }

    public mutating func pathChanged(satisfied: Bool) {
        pathSatisfied = satisfied
    }

    /// Call for transport failures only (no connection, timeout, DNS), not for HTTP errors.
    public mutating func requestFailed(atMs: Int64) {
        lastFailureMs = atMs
    }

    public mutating func requestSucceeded(atMs: Int64) {
        if let f = lastFailureMs, atMs >= f { lastFailureMs = nil }
    }

    public func isOnline(nowMs: Int64) -> Bool {
        guard pathSatisfied else { return false }
        guard let f = lastFailureMs else { return true }
        return nowMs - f > holdMs
    }
}
