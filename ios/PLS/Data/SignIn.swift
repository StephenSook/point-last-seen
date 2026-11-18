import FirebaseAuth
import Foundation

/// Anonymous sign-in that is tried again until it works: at start, on every return to signal
/// and before a send. The offline write queue is per user, so the phone must be signed in
/// before it leaves signal, and never signs out mid-mission.
@MainActor
final class SignIn {
    private let isSignedIn: () -> Bool
    private let attempt: () async -> Bool
    private var inFlight = false

    init(isSignedIn: @escaping () -> Bool, attempt: @escaping () async -> Bool) {
        self.isSignedIn = isSignedIn
        self.attempt = attempt
    }

    /// Firebase Auth: anonymous sign-in.
    static func firebase() -> SignIn {
        SignIn(isSignedIn: { Auth.auth().currentUser != nil }, attempt: {
            do {
                _ = try await Auth.auth().signInAnonymously()
                return true
            } catch {
                return false
            }
        })
    }

    var signedIn: Bool { isSignedIn() }

    /// True when signed in, after trying once more if needed.
    func ensure() async -> Bool {
        if isSignedIn() { return true }
        guard !inFlight else { return false }
        inFlight = true
        defer { inFlight = false }
        return await attempt()
    }
}
