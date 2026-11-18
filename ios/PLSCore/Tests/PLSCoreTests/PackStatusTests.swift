import Foundation
import Testing
@testable import PLSCore

@Suite struct PackStatusTests {
    @Test func packStatusIsStaleWhenRemotePriorIsNewer() {
        let local = PackInfo(packVersion: 1, priorVersion: 1, eventSetHash: "a"), remote = PackInfo(packVersion: 2, priorVersion: 2, eventSetHash: "b")
        #expect(PackStatus.evaluate(local: local, remote: remote) == .stale(reason: "prior v2 at command, v1 on this phone"))
        #expect(PackStatus.evaluate(local: local, remote: nil) == .current)
        #expect(PackStatus.evaluate(local: nil, remote: remote) == .notPacked)
    }

    @Test func aNewerPackOnTheSamePriorIsAlsoStale() {
        let local = PackInfo(packVersion: 3, priorVersion: 2, eventSetHash: "a"), remote = PackInfo(packVersion: 4, priorVersion: 2, eventSetHash: "a")
        #expect(PackStatus.evaluate(local: local, remote: remote) == .stale(reason: "pack v4 at command, v3 on this phone"))
    }

    @Test func newEventsAloneDoNotMakeThePackStale() {
        let local = PackInfo(packVersion: 3, priorVersion: 2, eventSetHash: "a"), remote = PackInfo(packVersion: 3, priorVersion: 2, eventSetHash: "b")
        #expect(PackStatus.evaluate(local: local, remote: remote) == .current)
    }

    @Test func clockOffsetIsServerMinusDevice() {
        #expect(ClockOffset.compute(serverMs: 1_000_500, deviceMs: 1_000_000) == 500)
        #expect(ClockOffset.compute(serverMs: 1_000_000, deviceMs: 1_002_000) == -2000)
    }

    @Test func httpDateHeaderGivesServerMilliseconds() {
        // 2026-11-17T04:10:00Z
        #expect(ClockOffset.serverMs(httpDate: "Tue, 17 Nov 2026 04:10:00 GMT") == 1_794_888_600_000)
        #expect(ClockOffset.serverMs(httpDate: "not a date") == nil)
    }
}
