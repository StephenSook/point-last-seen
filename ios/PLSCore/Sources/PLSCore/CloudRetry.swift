import Foundation

/// One cloud call's result as the retry needs it: done, or refused for rate (HTTP 429).
public enum CloudAttempt<T: Sendable>: Sendable {
    case done(Result<T, ReadFailure>)
    /// Seconds the server asked us to wait, when it said.
    case rateLimited(retryAfterSeconds: Double?)
}

extension CloudAttempt: Equatable where T: Equatable {}

/// A cloud 429 retries once after a short wait: the server's delay when it gives one, else 2 s.
/// A delay longer than `maxWaitSeconds` is not waited, because the wait and a second call would
/// not fit in the read's 20 s stage limit. A second 429 takes the normal failure path (`other`,
/// which moves the read to the parser). No other failure retries.
public enum CloudRetry {
    public static let defaultWaitSeconds = 2.0
    public static let maxWaitSeconds = 5.0

    public static func run<T: Sendable>(sleep: @Sendable (Double) async -> Void,
                                        _ attempt: @Sendable () async -> CloudAttempt<T>) async -> Result<T, ReadFailure> {
        switch await attempt() {
        case let .done(result):
            return result
        case let .rateLimited(after):
            let wait = max(0, after ?? defaultWaitSeconds)
            guard wait <= maxWaitSeconds else { return .failure(.other) }
            await sleep(wait)
            switch await attempt() {
            case let .done(result): return result
            case .rateLimited: return .failure(.other)
            }
        }
    }
}
