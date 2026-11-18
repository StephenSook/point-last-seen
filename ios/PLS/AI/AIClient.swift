import FirebaseAILogic

/// The one place the app builds its Firebase AI Logic client (Gemini Developer API backend).
/// App Check guards every call; limited-use tokens follow the Remote Config switch.
enum AIClient {
    static func make(useLimitedUseTokens: Bool) -> FirebaseAI {
        FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: useLimitedUseTokens)
    }
}
