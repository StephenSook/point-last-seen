import Foundation
import Testing
@testable import PLS

/// The app ships a privacy manifest: no tracking, the data a report sends (precise location, the
/// anonymous user id, the report's words) for the app's own function, the data the build's Firebase
/// SDKs declare (device id, crash, performance and other diagnostic data), and the one required-reason
/// API the app's code uses (its own UserDefaults, reason CA92.1).
@Suite struct PrivacyManifestTests {
    @Test func theAppBundleCarriesThePrivacyManifest() throws {
        let url = try #require(Bundle(for: AppModel.self).url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plist = try #require(try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        #expect(plist["NSPrivacyTracking"] as? Bool == false)
        let collected = (plist["NSPrivacyCollectedDataTypes"] as? [[String: Any]] ?? []).compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        // The App Store label's eight types (ios/app-privacy-label.json): the report's own data, and what the
        // Firebase SDKs in the build declare (scripts/check_privacy_label.py holds the two to each other).
        #expect(Set(collected) == Set(["PreciseLocation", "UserID", "OtherUserContent", "DeviceID", "CrashData", "PerformanceData",
                                       "OtherDiagnosticData", "OtherDataTypes"].map { "NSPrivacyCollectedDataType" + $0 }))
        let apis = plist["NSPrivacyAccessedAPITypes"] as? [[String: Any]] ?? []
        #expect(apis.count == 1)
        #expect(apis.first?["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults")
        #expect(apis.first?["NSPrivacyAccessedAPITypeReasons"] as? [String] == ["CA92.1"])
    }
}
