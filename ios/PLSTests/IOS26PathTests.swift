import Foundation
import FoundationModels
import PLSCore
import Testing
@testable import PLS

/// The app installs on iOS 26 (Apple's on-device model needs only iOS 26). Each iOS 27-only call has an
/// iOS 26 path; the cloud route needs iOS 27, so on iOS 26 a read is Apple's model, then rules.
@Suite struct IOS26PathTests {
    @Test func anEmptyVariantNameReadsAsAPlainName() {
        #expect(ModelSessionFactory.variantName("") == "Apple on-device model")
        #expect(ModelSessionFactory.variantName(" AFM 3 Core Advanced ") == "AFM 3 Core Advanced")
    }

    /// Below iOS 26.4 the model cannot count tokens, so the reader uses the characters-per-token estimate.
    @Test func theTokenEstimateIsByCharacters() {
        #expect(ModelSessionFactory.tokenEstimate(String(repeating: "x", count: 300)) == 1300)
    }

    /// On iOS 26 Apple's model throws LanguageModelSession.GenerationError; each case maps to the read
    /// failure the router understands, as LanguageModelError does on iOS 27.
    @Test func iOS26ModelErrorsMapToTheirReadFailures() {
        typealias G = LanguageModelSession.GenerationError
        let c = G.Context(debugDescription: "x")
        #expect(ModelSessionFactory.failure(from: G.guardrailViolation(c)) == .guardrailBlock)
        #expect(ModelSessionFactory.failure(from: G.exceededContextWindowSize(c)) == .contextExceeded)
        #expect(ModelSessionFactory.failure(from: G.unsupportedLanguageOrLocale(c)) == .unavailable)
        #expect(ModelSessionFactory.failure(from: G.assetsUnavailable(c)) == .unavailable)
        #expect(ModelSessionFactory.failure(from: G.decodingFailure(c)) == .parseFailed)
        #expect(ModelSessionFactory.failure(from: G.rateLimited(c)) == .other)
    }

    /// These tests run on an iOS 27 simulator in CI and on an iOS 26.5 simulator for the minimum-version run.
    @Test func theCloudRouteIsSupportedFromIOS27() {
        if #available(iOS 27, *) {
            #expect(ModelSessionFactory.cloudRouteSupported)
        } else {
            #expect(!ModelSessionFactory.cloudRouteSupported)
        }
    }
}
