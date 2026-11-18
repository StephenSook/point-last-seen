import Foundation

/// How a Gemini route failure maps to a read failure. The app reads the case and status
/// code from `GeminiLanguageModel.Error`; a 401 or 403 is App Check refusing the call.
public enum CloudFailure {
    public enum Kind: Sendable { case serviceUnavailable, networkFailure, modelNotFound, apiError, invalidResponse }

    public static func classify(_ kind: Kind, statusCode: Int?) -> ReadFailure {
        switch kind {
        case .apiError: return statusCode == 401 || statusCode == 403 ? .appCheckRefused : .other
        case .networkFailure, .serviceUnavailable: return .network
        case .invalidResponse: return .parseFailed
        case .modelNotFound: return .other
        }
    }
}
