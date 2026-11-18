import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
@Suite struct AppModelTests {
    @Test func aReportThatCannotBeJournaledStaysInTheField() async {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))   // no pack, nothing started
        let left = await model.submit("cleared segment AC, coverage point eight", inputMethod: .typed)
        #expect(left == "cleared segment AC, coverage point eight")
        #expect(model.problem == "No pack loaded.")
        #expect(model.sending == false)
    }

    @Test func aKillSwitchFlipReachesTheLiveGateAtOnce() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.gate.current.killCloud == false)
        model.config.killCloud = true
        #expect(model.gate.current.killCloud == true)
    }
}

