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

    /// An answer cut off by the response cap comes back as "The model produced an empty response."
    /// (unsupportedTranscriptContent, measured on the simulator), so it gets its own failure and note.
    @Test func anAnswerCutOffByTheCapIsAnEmptyResponse() {
        #expect(ModelSessionFactory.failure(from: LanguageModelError.unsupportedTranscriptContent(.init(unsupportedContent: [], debugDescription: "x"))) == .emptyResponse)
    }

    @Test func aCloudRateLimitBecomesARetryWithTheServersDelay() {
        let now = Date(timeIntervalSince1970: 1_000)
        let withDelay = LanguageModelError.rateLimited(.init(resetDate: now.addingTimeInterval(3), debugDescription: "x"))
        #expect(ModelSessionFactory.cloudAttempt(failing: withDelay, now: now) as CloudAttempt<Int> == .rateLimited(retryAfterSeconds: 3))
        let noDelay = LanguageModelError.rateLimited(.init(resetDate: nil, debugDescription: "x"))
        #expect(ModelSessionFactory.cloudAttempt(failing: noDelay, now: now) as CloudAttempt<Int> == .rateLimited(retryAfterSeconds: nil))
        #expect(ModelSessionFactory.cloudAttempt(failing: URLError(.notConnectedToInternet), now: now) as CloudAttempt<Int> == .done(.failure(.network)))
    }
}
