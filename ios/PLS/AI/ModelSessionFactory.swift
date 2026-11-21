import FirebaseAILogic
import Foundation
import FoundationModels
import PLSCore

/// The only file that touches Apple's on-device model or Gemini sessions (rules gate).
/// Our app is the router on iOS: PLSCore decides, this file runs what was decided.
enum ModelSessionFactory {
    static func onDeviceStatus(locale: Locale = .current) -> OnDeviceStatus {
        let model = SystemLanguageModel.default
        // iOS 26 has no variant name, and the simulator reports an empty one: both read as a plain name.
        var shown = ""
        if #available(iOS 27, *) { shown = model.variant.displayName }
        return OnDeviceStatus(available: model.isAvailable, localeSupported: model.supportsLocale(locale),
                              contextSize: model.contextSize, variant: variantName(shown))
    }

    static func variantName(_ shown: String) -> String {
        let name = shown.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Apple on-device model" : name
    }

    /// The cloud route runs Gemini in a FoundationModels session, which needs iOS 27. On iOS 26 the route
    /// is off, so a read is Apple's model, then rules.
    static var cloudRouteSupported: Bool {
        if #available(iOS 27, *) { return true }
        return false
    }

    /// Why the on-device model is not available, for the Ready check.
    static func unavailableReason() -> String? {
        switch SystemLanguageModel.default.availability {
        case .available: return nil
        case let .unavailable(reason):
            switch reason {
            case .deviceNotEligible: return "This iPhone cannot run Apple's on-device model."
            case .appleIntelligenceNotEnabled: return "Apple Intelligence is turned off in Settings."
            case .modelNotReady: return "The on-device model is still downloading. Stay in signal."
            @unknown default: return "The on-device model is not available."
            }
        }
    }

    /// Loads the on-device model before the team leaves signal.
    static func prewarm() {
        LanguageModelSession(model: SystemLanguageModel.default, instructions: ReportPrompt.guided).prewarm()
    }

    /// Tokens for one guided read: instructions, tools, schema and the report. Falls back to
    /// a characters-per-token estimate when the count is not available.
    static func estimateTokens(report: String, tools: [any Tool]) async -> Int {
        // The model counts tokens from iOS 26.4; before that, the estimate.
        guard #available(iOS 26.4, *) else { return tokenEstimate(report) }
        let model = SystemLanguageModel.default
        do {
            // Apple's model gets no tools, so none are counted.
            let parts = try await [model.tokenCount(for: Instructions(FoundationModelRunner.onDeviceInstructionsText(tools))),
                                   model.tokenCount(for: report), model.tokenCount(for: ReportReadingG.generationSchema)]
            return parts.reduce(0, +)
        } catch {
            return tokenEstimate(report)
        }
    }

    /// A characters-per-token estimate, with room for the instructions and the schema.
    static func tokenEstimate(_ report: String) -> Int { 1200 + report.count / 3 }

    /// Maps a thrown model error to the read failure the router understands.
    static func failure(from error: any Error) -> ReadFailure {
        if #available(iOS 27, *), let f = failureFromIOS27Types(error) { return f }
        switch error {
        // What Apple's model throws on iOS 26.
        case let e as LanguageModelSession.GenerationError: return failure(generation: e)
        case is CancellationError: return .cancelled
        case is URLError: return .network
        case is DecodingError: return .parseFailed
        default: return .other
        }
    }

    /// The error types of iOS 27: Apple's model, Gemini in the same kind of session, and the parser.
    @available(iOS 27, *)
    static func failureFromIOS27Types(_ error: any Error) -> ReadFailure? {
        switch error {
        case let e as LanguageModelError:
            switch e {
            case .guardrailViolation: return .guardrailBlock
            case .refusal: return .refusal
            case .contextSizeExceeded: return .contextExceeded
            case .unsupportedLanguageOrLocale: return .unavailable
            case .timeout: return .network
            // An answer cut off by the response cap comes back as this case ("The model produced an empty
            // response.", measured on the simulator with a 12-token cap).
            case .unsupportedTranscriptContent: return .emptyResponse
            case .rateLimited, .unsupportedCapability, .unsupportedGenerationGuide: return .other
            @unknown default: return .other
            }
        case let e as SystemLanguageModel.Error:
            if case .assetsUnavailable = e { return .unavailable }
            return .other
        case let e as GeminiLanguageModel.Error:
            switch e {
            case .serviceUnavailable: return CloudFailure.classify(.serviceUnavailable, statusCode: 503)
            case .networkFailure: return CloudFailure.classify(.networkFailure, statusCode: nil)
            case .modelNotFound: return CloudFailure.classify(.modelNotFound, statusCode: 404)
            case let .apiError(api): return CloudFailure.classify(.apiError, statusCode: api.statusCode)
            case .invalidResponse: return CloudFailure.classify(.invalidResponse, statusCode: nil)
            @unknown default: return .other
            }
        case is GeneratedContent.ParsingError:
            return .parseFailed
        default:
            return nil
        }
    }

    /// Apple's model's errors on iOS 26 (deprecated on iOS 27 for LanguageModelError).
    static func failure(generation e: LanguageModelSession.GenerationError) -> ReadFailure {
        switch e {
        case .guardrailViolation: return .guardrailBlock
        case .refusal: return .refusal
        case .exceededContextWindowSize: return .contextExceeded
        case .unsupportedLanguageOrLocale, .assetsUnavailable: return .unavailable
        case .decodingFailure: return .parseFailed
        case .rateLimited, .concurrentRequests, .unsupportedGuide: return .other
        @unknown default: return .other
        }
    }
}

extension ModelSessionFactory {
    /// A cloud error as the retry sees it: a 429 (the SDK reports it as a rate limit, with the
    /// server's retry delay when one was sent) retries; everything else is a read failure.
    static func cloudAttempt<T: Sendable>(failing error: any Error, now: Date = .now) -> CloudAttempt<T> {
        if #available(iOS 27, *), case let .rateLimited(r)? = error as? LanguageModelError {
            return .rateLimited(retryAfterSeconds: r.resetDate.map { $0.timeIntervalSince(now) })
        }
        return .done(.failure(failure(from: error)))
    }
}

/// Runs the stages PLSCore asks for. One new session per report, so history never grows.
struct FoundationModelRunner: ReadModelRunner {
    let ai: FirebaseAI
    let cloudModel: String
    let tools: [any Tool]

    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        switch path {
        case .onDevice:
            let session = Self.onDeviceSession(tools)
            do {
                return .success(try await session.respond(to: text, generating: ReportReadingG.self, options: Self.onDeviceOptions).content.reading)
            } catch {
                return .failure(ModelSessionFactory.failure(from: error))
            }
        case .cloud:
            // Gemini in a FoundationModels session needs iOS 27; the reader keeps the route off before that.
            guard #available(iOS 27, *) else { return .failure(.unavailable) }
            // A 429 retries once after a short wait (CloudRetry); each try is a new session.
            return await CloudRetry.run(sleep: { try? await Task.sleep(for: .seconds($0)) }) {
                let session = LanguageModelSession(model: ai.geminiLanguageModel(name: cloudModel), tools: tools, instructions: ReportPrompt.guided)
                do {
                    return .done(.success(try await session.respond(to: text, generating: ReportReadingG.self).content.reading))
                } catch {
                    return ModelSessionFactory.cloudAttempt(failing: error)
                }
            }
        case .rules:
            return .failure(.other)
        }
    }

    /// Apple's model reads with greedy sampling: the same report gets the same answer every time. Its answer
    /// is capped, so a read that runs away ends in seconds (as empty_response) instead of holding the model
    /// after our time limit: on the simulator, timed-out reads kept the model busy and later reads queued.
    static let onDeviceOptions = GenerationOptions(samplingMode: .greedy, maximumResponseTokens: onDeviceResponseTokenCap)

    /// The cap, from the longest valid reading: SystemLanguageModel.tokenCount on the JSON of a reading with
    /// every field set, three segments, a 40-character item, footwear and carried, and a 934-character quote
    /// (the report limit is 1,000 characters) measured 323 tokens on the simulator (a typical reading, 117).
    /// 512 is that with a margin.
    static let onDeviceResponseTokenCap = 512

    /// Apple's model's session: no tools at all (with greedy sampling it called the team-assignment tool in a
    /// loop, 168 calls on one report). Where the team is and what it was assigned, which the tools would have
    /// told it, come from code as plain sentences in its instructions. No description of the subject either.
    static func onDeviceSession(_ tools: [any Tool]) -> LanguageModelSession {
        LanguageModelSession(model: SystemLanguageModel.default, tools: [], instructions: Instructions(onDeviceInstructionsText(tools)))
    }

    /// Apple's model's instructions, with the position and assignment the cloud gets from its tools.
    static func onDeviceInstructionsText(_ tools: [any Tool]) -> String {
        let position = tools.lazy.compactMap { $0 as? SegmentAtTool }.first?.positionSegmentId
        let assigned = tools.lazy.compactMap { $0 as? TeamAssignmentTool }.first?.assignedSegmentIds ?? []
        return PromptText.onDeviceGuided(positionSegmentId: position, assignedSegmentIds: assigned)
    }

    /// Same on-device model with permissive guardrails; string output only (guided generation
    /// always runs the default guardrails). Never used on the cloud route.
    func permissive(_ text: String) async -> Result<String, ReadFailure> {
        let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
        let session = LanguageModelSession(model: model, instructions: ReportPrompt.permissive)
        do {
            return .success(try await session.respond(to: text, options: Self.onDeviceOptions).content)
        } catch {
            return .failure(ModelSessionFactory.failure(from: error))
        }
    }
}
