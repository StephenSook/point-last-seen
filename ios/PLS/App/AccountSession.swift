import FirebaseAuth
import Foundation

/// One signed-in session: the user, and how many account changes the phone had seen when it began.
/// A load, a push tap and a spoken line carry the session they started in and act only while it is
/// still the current one, so nothing read for one user is installed, opened or spoken for another,
/// or for no one.
struct AccountSession: Equatable, Sendable {
    let uid: String
    let generation: Int
}

/// Where Auth's user changes come from: Firebase's state listener, or a stand-in in tests.
@MainActor
protocol AccountEvents: AnyObject {
    /// Calls `onChange` with each user Auth reports (nil when signed out), one at a time, in order.
    func observe(_ onChange: @escaping @MainActor (String?) -> Void)
}

/// Auth's state listener. Firebase calls it on the main thread with the user it is reporting.
@MainActor
final class FirebaseAccountEvents: AccountEvents {
    private var handle: AuthStateDidChangeListenerHandle?

    func observe(_ onChange: @escaping @MainActor (String?) -> Void) {
        handle = Auth.auth().addStateDidChangeListener { _, user in
            let reported = user?.uid
            MainActor.assumeIsolated { onChange(reported) }
        }
    }
}
