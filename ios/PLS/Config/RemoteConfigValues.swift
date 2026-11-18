import Foundation
import PLSCore

/// The Remote Config values the phone reads (none changes engine output, spec section 14).
/// Defaults apply until the first fetch, whenever the phone is offline, and for any key whose
/// value is missing or unreadable.
struct RemoteConfigValues: Equatable, Sendable {
    var cloudModelIOS: String
    var tokenBudgetFraction: Double
    var killCloud: Bool
    var useLimitedUseTokens: Bool
    var minimumVersionIOS: String
    /// The AI Logic voice model for spoken assignments. Empty means the phone's own voice only;
    /// no model id is named in the app's source.
    var ttsModelIOS: String

    static let defaults = RemoteConfigValues(cloudModelIOS: "gemini-3.5-flash-lite", tokenBudgetFraction: 0.5,
                                             killCloud: false, useLimitedUseTokens: true, minimumVersionIOS: "0.1.0",
                                             ttsModelIOS: "")

    /// The keys this platform owns (design section 14).
    static let keys = ["cloud_model_ios", "token_budget_fraction", "kill_cloud", "use_limited_use_tokens", "minimum_version_ios",
                       "tts_model_ios"]

    /// Reads each key; a missing or unreadable value keeps its default.
    static func from(_ value: (String) -> String?) -> RemoteConfigValues {
        var v = defaults
        if let s = text(value("cloud_model_ios")) { v.cloudModelIOS = s }
        if let s = text(value("token_budget_fraction")), let f = Double(s), f.isFinite, f > 0, f <= 1 { v.tokenBudgetFraction = f }
        if let b = flag(value("kill_cloud")) { v.killCloud = b }
        if let b = flag(value("use_limited_use_tokens")) { v.useLimitedUseTokens = b }
        if let s = text(value("minimum_version_ios")) { v.minimumVersionIOS = s }
        if let s = text(value("tts_model_ios")) { v.ttsModelIOS = s }
        return v
    }

    /// The defaults as Remote Config strings, under the same keys.
    var asStrings: [String: String] {
        ["cloud_model_ios": cloudModelIOS, "token_budget_fraction": String(tokenBudgetFraction), "kill_cloud": String(killCloud),
         "use_limited_use_tokens": String(useLimitedUseTokens), "minimum_version_ios": minimumVersionIOS,
         "tts_model_ios": ttsModelIOS]
    }

    /// True when command has raised the minimum above this build's version.
    func needsUpdate(appVersion: String) -> Bool {
        AppVersion.isBelow(appVersion, minimum: minimumVersionIOS)
    }

    private static func text(_ s: String?) -> String? {
        guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }

    private static func flag(_ s: String?) -> Bool? {
        switch text(s)?.lowercased() {
        case "true", "1", "yes", "on": return true
        case "false", "0", "no", "off": return false
        default: return nil
        }
    }
}
