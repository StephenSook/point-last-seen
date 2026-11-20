import Foundation
import Testing
@testable import PLSCore

@Suite struct TimeoutTests {
    @Test func aCallThatTakesTooLongGivesNilQuickly() async {
        let start = Date()
        let v: Int? = await Timeout.run(seconds: 0.1) { try? await Task.sleep(for: .seconds(30)); return 1 }
        #expect(v == nil)
        #expect(Date().timeIntervalSince(start) < 5)
    }

    /// On timeout the call itself is cancelled, so a model call stops instead of running on unseen.
    @Test func aCallThatTimesOutIsCancelled() async {
        let seen = CancelSeen()
        let v: Int? = await Timeout.run(seconds: 0.05) {
            do { try await Task.sleep(for: .seconds(30)) } catch { await seen.mark() }
            return 1
        }
        #expect(v == nil)
        for _ in 0..<100 where await !seen.value { try? await Task.sleep(for: .milliseconds(10)) }
        #expect(await seen.value)
    }

    @Test func aQuickCallGivesItsValue() async {
        #expect(await Timeout.run(seconds: 5) { 7 } == 7)
    }
}

actor CancelSeen {
    var value = false
    func mark() { value = true }
}
