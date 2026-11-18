import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct RemoteConfigValuesTests {
    @Test func theFiveIOSKeysAreRead() {
        let v = RemoteConfigValues.from(["cloud_model_ios": "test-cloud-model", "token_budget_fraction": "0.4", "kill_cloud": "true",
                                         "use_limited_use_tokens": "false", "minimum_version_ios": "0.2.0",
                                         "voice_template_id": " pls-voice-v2 "].lookup)
        #expect(v == RemoteConfigValues(cloudModelIOS: "test-cloud-model", tokenBudgetFraction: 0.4, killCloud: true,
                                        useLimitedUseTokens: false, minimumVersionIOS: "0.2.0", voiceTemplateId: "pls-voice-v2"))
    }

    @Test func missingOrBadValuesKeepTheDefaults() {
        #expect(RemoteConfigValues.from([:].lookup) == .defaults)
        let bad = RemoteConfigValues.from(["cloud_model_ios": "  ", "token_budget_fraction": "2", "kill_cloud": "maybe",
                                           "use_limited_use_tokens": "", "minimum_version_ios": ""].lookup)
        #expect(bad == .defaults)
        #expect(RemoteConfigValues.from(["token_budget_fraction": "nan"].lookup).tokenBudgetFraction == 0.5)
        #expect(RemoteConfigValues.from(["token_budget_fraction": "0"].lookup).tokenBudgetFraction == 0.5)
    }

    /// The cloud voice is the published prompt template; an explicit empty value turns it off.
    @Test func theCloudVoiceIsThePublishedTemplate() {
        #expect(RemoteConfigValues.defaults.voiceTemplateId == "pls-voice-v1")
        #expect(RemoteConfigValues.keys.contains("voice_template_id") && !RemoteConfigValues.keys.contains("tts_model_ios"))
        #expect(RemoteConfigValues.from(["voice_template_id": "  "].lookup).voiceTemplateId == "")
        #expect(RemoteConfigValues.from([:].lookup).voiceTemplateId == "pls-voice-v1")
    }

    /// The template takes 1 to 600 characters of text; anything else stays on the phone's own voice.
    @Test func onlyTextTheTemplateTakesGoesToTheCloudVoice() {
        #expect(CloudVoice.fitsTemplate("New assignment. Segment A C."))
        #expect(CloudVoice.fitsTemplate(String(repeating: "a", count: 600)))
        #expect(!CloudVoice.fitsTemplate(String(repeating: "a", count: 601)) && !CloudVoice.fitsTemplate(""))
    }

    @Test func theDefaultsAreWrittenUnderTheSameKeys() {
        let d = RemoteConfigValues.defaults.asStrings
        #expect(Set(d.keys) == Set(RemoteConfigValues.keys))
        #expect(RemoteConfigValues.from(d.lookup) == .defaults)
    }

    @Test func anOldBuildIsAskedToUpdate() {
        var v = RemoteConfigValues.defaults
        v.minimumVersionIOS = "0.2.0"
        #expect(v.needsUpdate(appVersion: "0.1.0"))
        #expect(!v.needsUpdate(appVersion: "0.2.0"))
        #expect(!RemoteConfigValues.defaults.needsUpdate(appVersion: "0.1.0"))
    }
}

extension Dictionary where Key == String, Value == String {
    var lookup: (String) -> String? { { self[$0] } }
}
