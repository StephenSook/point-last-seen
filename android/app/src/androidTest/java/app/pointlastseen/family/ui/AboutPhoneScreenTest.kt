package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AboutPhoneScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    @Test fun showsTheCheckStatusAnswerAndWhereNotesAreRead() {
        rule.setContent {
            PaperTheme {
                AboutPhoneScreen(
                    model = ModelState(DeviceModelStatus.UNAVAILABLE), mode = "drill", killCloud = false,
                    modelName = "gemini-3.5-flash-lite", appCheck = "debug", version = "0.1.0", onGetModel = {}, onBack = {},
                )
            }
        }
        rule.onNodeWithText("This phone has no on-device model.").assertIsDisplayed()
        rule.onNodeWithText("Notes and clips are read in the cloud through Firebase AI Logic.").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Cloud model: gemini-3.5-flash-lite").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("License: Apache-2.0").performScrollTo().assertIsDisplayed()
    }

    @Test fun aPhoneWithALocalModelSaysSo() {
        rule.setContent { PaperTheme { AboutPhoneScreen(ModelState(DeviceModelStatus.AVAILABLE), null, false, "m", "play_integrity", "0.1.0", onGetModel = {}, onBack = {}) } }
        rule.onNodeWithText("Ready on this phone.").assertIsDisplayed()
        rule.onNodeWithText("Notes are read on this phone first, through Firebase AI Logic.").performScrollTo().assertIsDisplayed()
    }

    @Test fun aDownloadableModelIsOfferedAndTheTapAsksForIt() {
        var asked = false
        rule.setContent { PaperTheme { AboutPhoneScreen(ModelState(DeviceModelStatus.DOWNLOADABLE), null, false, "m", "play_integrity", "0.1.0", onGetModel = { asked = true }, onBack = {}) } }
        rule.onNodeWithText("An on-device model can be downloaded to this phone.").assertIsDisplayed()
        rule.onNodeWithText("Get the on-device model").performScrollTo().performClick()
        assertTrue(asked)
    }

    @Test fun aDownloadShowsItsProgressAndNoSecondOffer() {
        rule.setContent { PaperTheme { AboutPhoneScreen(ModelState(DeviceModelStatus.DOWNLOADING, 40, 100), null, false, "m", "play_integrity", "0.1.0", onGetModel = {}, onBack = {}) } }
        rule.onNodeWithText("The on-device model is downloading: 40%.").assertIsDisplayed()
        rule.onNodeWithText("Get the on-device model").assertDoesNotExist()
    }

    @Test fun aFailedDownloadSaysSoAndCanBeTriedAgain() {
        rule.setContent { PaperTheme { AboutPhoneScreen(ModelState(DeviceModelStatus.DOWNLOADABLE, downloadFailed = true), null, false, "m", "play_integrity", "0.1.0", onGetModel = {}, onBack = {}) } }
        rule.onNodeWithText(Copy.MODEL_FAILED).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Get the on-device model").performScrollTo().assertIsDisplayed()
    }
}
