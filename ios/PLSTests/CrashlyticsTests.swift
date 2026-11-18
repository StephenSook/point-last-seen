import FirebaseCrashlytics
import Testing
@testable import PLS

/// Crashlytics collects crash reports from the field app (P-15). It records stack traces only;
/// the app sets no custom keys or logs, so no report text or subject data reaches it.
@Suite struct CrashlyticsTests {
    @Test func crashReportsAreCollected() {
        #expect(Crashlytics.crashlytics().isCrashlyticsCollectionEnabled())
    }
}
