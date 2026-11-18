import Foundation
import FoundationModels
import PLSCore
import Testing
@testable import PLS

@Suite struct ModelFailureMappingTests {
    @Test func guardrailAndRefusalKeepTheirOwnCases() {
        #expect(ModelSessionFactory.failure(from: LanguageModelError.guardrailViolation(.init(debugDescription: "x"))) == .guardrailBlock)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.refusal(.init(explanation: "no", debugDescription: "x"))) == .refusal)
    }

    @Test func otherModelErrorsMapToTheirReadFailures() {
        #expect(ModelSessionFactory.failure(from: LanguageModelError.contextSizeExceeded(.init(contextSize: 4096, tokenCount: 5000, debugDescription: "x"))) == .contextExceeded)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.unsupportedLanguageOrLocale(.init(languageCode: .french, debugDescription: "x"))) == .unavailable)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.rateLimited(.init(resetDate: nil, debugDescription: "x"))) == .other)
        #expect(ModelSessionFactory.failure(from: CancellationError()) == .cancelled)
        #expect(ModelSessionFactory.failure(from: URLError(.notConnectedToInternet)) == .network)
        #expect(ModelSessionFactory.failure(from: NSError(domain: "x", code: 1)) == .other)
    }
}
