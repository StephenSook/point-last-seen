import Foundation

/// The Remote Config values the phone reads (none changes engine output, spec section 14).
/// Defaults apply until the first fetch and whenever the phone is offline.
struct RemoteConfigValues: Equatable, Sendable {
    var cloudModelIOS: String
    var tokenBudgetFraction: Double
    var killCloud: Bool
    var useLimitedUseTokens: Bool
    var minimumVersionIOS: String

    static let defaults = RemoteConfigValues(cloudModelIOS: "gemini-3.5-flash-lite", tokenBudgetFraction: 0.5,
                                             killCloud: false, useLimitedUseTokens: true, minimumVersionIOS: "0.1.0")
}
