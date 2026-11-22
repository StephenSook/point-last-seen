import Foundation
import Testing
@testable import PLS

@MainActor
@Suite struct EvalKeyBundleTests {
    /// The debug app carries the eval's answer key, the exact file pinned in the core tests
    /// (EvalKeyPinTests.pinnedSHA256), so the eval screen scores against the committed key.
    @Test func theDebugAppBundlesThePinnedAnswerKey() throws {
        let loaded = try #require(EvalView.loadKey())
        #expect(loaded.sha256 == "f98c6f5dd978674a50b7305ed50985ea4227fd6d91ebbf9206eaf70e85a33d20")
        #expect(loaded.key.answerKey == EvalView.keyName && loaded.key.rows.count == 20)
    }
}
