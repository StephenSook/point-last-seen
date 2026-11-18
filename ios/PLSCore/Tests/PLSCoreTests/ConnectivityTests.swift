import Testing
@testable import PLSCore

/// networkOnline = the OS path is satisfied AND no network-class request failure has been
/// seen since the last success (a failure counts for `holdMs`, then the path decides again).
@Suite struct ConnectivityTests {
    @Test func pathAloneDecidesWithNoRequestHistory() {
        var c = Connectivity(holdMs: 60_000)
        #expect(c.isOnline(nowMs: 0) == false)
        c.pathChanged(satisfied: true)
        #expect(c.isOnline(nowMs: 0))
        c.pathChanged(satisfied: false)
        #expect(c.isOnline(nowMs: 0) == false)
    }

    @Test func aFailedRequestCountsAsOfflineEvenWhenThePathSaysOnline() {
        var c = Connectivity(holdMs: 60_000)
        c.pathChanged(satisfied: true)
        c.requestFailed(atMs: 1_000)
        #expect(c.isOnline(nowMs: 2_000) == false)
        #expect(c.isOnline(nowMs: 61_001))           // the hold has passed
    }

    @Test func aLaterSuccessClearsTheFailure() {
        var c = Connectivity(holdMs: 60_000)
        c.pathChanged(satisfied: true)
        c.requestFailed(atMs: 1_000)
        c.requestSucceeded(atMs: 1_500)
        #expect(c.isOnline(nowMs: 2_000))
    }
}
