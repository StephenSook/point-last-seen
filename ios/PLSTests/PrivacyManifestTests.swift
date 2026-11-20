import Foundation
import Testing
@testable import PLS

/// The app ships a privacy manifest: no tracking, the data a report sends (precise location, the
/// anonymous user id, the report's words) for the app's own function, and the one required-reason
/// API the app's code uses (its own UserDefaults, reason CA92.1).
@Suite struct PrivacyManifestTests {
    @Test func theAppBundleCarriesThePrivacyManifest() throws {
        let url = try #require(Bundle(for: AppModel.self).url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plist = try #require(try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        #expect(plist["NSPrivacyTracking"] as? Bool == false)
        let collected = (plist["NSPrivacyCollectedDataTypes"] as? [[String: Any]] ?? []).compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        #expect(Set(collected) == ["NSPrivacyCollectedDataTypePreciseLocation", "NSPrivacyCollectedDataTypeUserID",
                                   "NSPrivacyCollectedDataTypeOtherUserContent"])
        let apis = plist["NSPrivacyAccessedAPITypes"] as? [[String: Any]] ?? []
        #expect(apis.count == 1)
        #expect(apis.first?["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults")
        #expect(apis.first?["NSPrivacyAccessedAPITypeReasons"] as? [String] == ["CA92.1"])
    }
}
