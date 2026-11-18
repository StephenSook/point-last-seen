import Foundation
import Testing
@testable import PLS

@MainActor
@Suite struct SignInTests {
    @Test func signInIsTriedOnlyWhenNeededAndAgainAfterAFailure() async {
        var signedIn = false
        var attempts = 0
        var succeed = false
        let s = SignIn(isSignedIn: { signedIn }, attempt: { attempts += 1; if succeed { signedIn = true }; return succeed })
        #expect(await s.ensure() == false)          // offline at first launch
        #expect(attempts == 1)
        succeed = true
        #expect(await s.ensure() == true)           // back in signal: tried again
        #expect(attempts == 2)
        #expect(await s.ensure() == true)           // already signed in: no new attempt
        #expect(attempts == 2)
    }
}
