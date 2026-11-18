import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct LiveGateBoxTests {
    @Test func theBoxReturnsTheLatestGateFromAnyThread() async {
        let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: false, killCloud: false, incidentMode: "drill"))
        box.update { $0.killCloud = true }
        let read = await Task.detached { box.current }.value
        #expect(read.killCloud == true)
        #expect(read.incidentMode == "drill")
    }
}
