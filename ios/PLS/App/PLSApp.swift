import FirebaseAppCheck
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import SwiftUI

/// App Attest in release builds; the debug provider only in local debug builds, where the
/// token comes from the scheme's FIRAAppCheckDebugToken environment variable (never a file).
final class PLSAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
        #if DEBUG
        return AppCheckDebugProvider(app: app)
        #else
        return AppAttestProvider(app: app)
        #endif
    }
}

@main
struct PLSApp: App {
    init() {
        AppCheck.setAppCheckProviderFactory(PLSAppCheckFactory())
        FirebaseApp.configure()

        // Mission data is never collected from the cache while the team is out of signal.
        let settings = FirestoreSettings()
        settings.cacheSettings = PersistentCacheSettings(sizeBytes: FirestoreCacheSizeUnlimited as NSNumber)
        Firestore.firestore().settings = settings

        // Sign in before leaving signal; never sign out mid-mission (the offline write queue is per user).
        if Auth.auth().currentUser == nil {
            Auth.auth().signInAnonymously { _, _ in }
        }
    }

    var body: some Scene {
        WindowGroup {
            ReadyCheckView()
        }
    }
}
