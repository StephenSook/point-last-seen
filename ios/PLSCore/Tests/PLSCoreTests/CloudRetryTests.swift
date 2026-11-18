import Foundation
import Testing
@testable import PLSCore

/// A cloud 429 retries once after a short wait (the server's delay when it gives one, else
/// 2 s), then takes the normal failure path. Nothing else retries.
@Suite struct CloudRetryTests {
    final class Script: @unchecked Sendable {
        private let lock = NSLock()
        private var attempts: [CloudAttempt<String>]
        private(set) var calls = 0
        private(set) var waits: [Double] = []
        init(_ attempts: [CloudAttempt<String>]) { self.attempts = attempts }
        func next() -> CloudAttempt<String> {
            lock.lock(); defer { lock.unlock() }
            calls += 1
            return attempts.isEmpty ? .done(.failure(.other)) : attempts.removeFirst()
        }
        func wait(_ s: Double) { lock.lock(); waits.append(s); lock.unlock() }
    }

    func run(_ s: Script) async -> Result<String, ReadFailure> {
        await CloudRetry.run(sleep: { s.wait($0) }) { s.next() }
    }

    @Test func aRateLimitWaitsTwoSecondsAndRetriesOnce() async {
        let s = Script([.rateLimited(retryAfterSeconds: nil), .done(.success("read"))])
        #expect(await run(s) == .success("read"))
        #expect(s.calls == 2 && s.waits == [2])
    }

    @Test func theServersDelayIsHonored() async {
        let s = Script([.rateLimited(retryAfterSeconds: 4.5), .done(.success("read"))])
        #expect(await run(s) == .success("read"))
        #expect(s.waits == [4.5])
    }

    @Test func aSecondRateLimitTakesTheFailurePath() async {
        let s = Script([.rateLimited(retryAfterSeconds: nil), .rateLimited(retryAfterSeconds: nil), .done(.success("late"))])
        #expect(await run(s) == .failure(.other))
        #expect(s.calls == 2 && s.waits == [2])
    }

    @Test func aDelayLongerThanTheStageAllowsIsNotWaited() async {
        let s = Script([.rateLimited(retryAfterSeconds: 30), .done(.success("late"))])
        #expect(await run(s) == .failure(.other))
        #expect(s.calls == 1 && s.waits.isEmpty)
        #expect(CloudRetry.maxWaitSeconds == 5)
    }

    @Test func aDelayInThePastWaitsNothing() async {
        let s = Script([.rateLimited(retryAfterSeconds: -3), .done(.success("read"))])
        #expect(await run(s) == .success("read"))
        #expect(s.waits == [0])
    }

    @Test func otherFailuresNeverRetry() async {
        let s = Script([.done(.failure(.network)), .done(.success("late"))])
        #expect(await run(s) == .failure(.network))
        #expect(s.calls == 1 && s.waits.isEmpty)
    }
}
