import FirebaseCore
import Testing
@testable import PLS

/// A copy built without its Firebase settings file (a fresh clone) shows a plain screen instead of
/// crashing in FirebaseApp.configure(); settings missing a field every Firebase call needs count
/// as missing too, since Auth and Firestore would crash on them later.
@Suite struct FirebaseSetupTests {
    func options(apiKey: String? = "key", projectID: String? = "project") -> FirebaseOptions {
        let options = FirebaseOptions(googleAppID: "1:123:ios:abc", gcmSenderID: "123")
        options.apiKey = apiKey
        options.projectID = projectID
        return options
    }

    @Test func completeSettingsAreUsable() {
        #expect(FirebaseSetup.usable(options()))
    }

    @Test func noFileOrAMissingFieldIsNotUsable() {
        #expect(!FirebaseSetup.usable(nil))
        #expect(!FirebaseSetup.usable(FirebaseOptions(contentsOfFile: "/nonexistent/GoogleService-Info.plist")))
        #expect(!FirebaseSetup.usable(options(apiKey: nil)))
        #expect(!FirebaseSetup.usable(options(apiKey: "")))
        #expect(!FirebaseSetup.usable(options(projectID: nil)))
        #expect(!FirebaseSetup.usable(FirebaseOptions(googleAppID: "", gcmSenderID: "123")))
    }

    @Test func thePlainScreenSaysWhatIsMissingAndWhere() {
        #expect(FirebaseSetup.missing == "This copy of the app was built without its Firebase settings file, so it cannot sign in or load a mission. Add GoogleService-Info.plist to ios/PLS/Config and build again.")
    }
}
