import Foundation

/// One outstanding request at a time, each with its own token. Only a finish carrying the
/// current request's token resumes the waiter, so a late timer or callback from an earlier
/// request can never answer a later one.
@MainActor
final class FixGate<Value: Sendable> {
    private var token: UInt64 = 0
    private var continuation: CheckedContinuation<Value, Never>?

    var isWaiting: Bool { continuation != nil }

    /// Starts a request: `start` receives the token to pass back to `finish`.
    func wait(_ start: (UInt64) -> Void) async -> Value {
        token &+= 1
        let current = token
        return await withCheckedContinuation { c in
            continuation = c
            start(current)
        }
    }

    func finish(_ value: Value, token finishing: UInt64) {
        guard finishing == token, let c = continuation else { return }
        continuation = nil
        c.resume(returning: value)
    }
}
