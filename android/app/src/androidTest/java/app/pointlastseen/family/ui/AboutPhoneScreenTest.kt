package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ui.theme.PaperTheme
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
                    status = DeviceModelStatus.UNAVAILABLE, mode = "drill", killCloud = false,
                    modelName = "gemini-3.5-flash-lite", appCheck = "debug", version = "0.1.0", onBack = {},
                )
            }
        }
        rule.onNodeWithText("This phone has no on-device model.").assertIsDisplayed()
        rule.onNodeWithText("Notes and clips are read in the cloud through Firebase AI Logic.").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Cloud model: gemini-3.5-flash-lite").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("License: Apache-2.0").performScrollTo().assertIsDisplayed()
    }

    @Test fun aPhoneWithALocalModelSaysSo() {
        rule.setContent { PaperTheme { AboutPhoneScreen(DeviceModelStatus.AVAILABLE, null, false, "m", "play_integrity", "0.1.0", onBack = {}) } }
        rule.onNodeWithText("This phone has an on-device model.").assertIsDisplayed()
        rule.onNodeWithText("Notes are read on this phone first, through Firebase AI Logic.").performScrollTo().assertIsDisplayed()
    }
}
