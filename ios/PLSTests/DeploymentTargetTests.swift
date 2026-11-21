import Foundation
import Testing
@testable import PLS

@Suite struct DeploymentTargetTests {
    /// The app installs on iOS 26: Apple's on-device model (FoundationModels) needs iOS 26, and every
    /// iOS 27-only call has an iOS 26 path, so a phone that has not updated can still run it.
    @Test func theAppInstallsOnIOS26() {
        #expect(Bundle.main.infoDictionary?["MinimumOSVersion"] as? String == "26.0")
    }
}
