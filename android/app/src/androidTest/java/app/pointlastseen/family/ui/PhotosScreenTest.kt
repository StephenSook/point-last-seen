package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhotosScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    @Test fun sayingWhatHappensToAPhotoBeforeItLeaves() {
        var picked = 0
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 0, busy = false, error = null), onPick = { picked++ }, onBack = {}) } }
        rule.onNodeWithText("Photos are made smaller and their location data is removed before they leave this phone.").assertIsDisplayed()
        rule.onNodeWithText("Choose photos").performClick()
        assertEquals(1, picked)
    }

    @Test fun progressAndErrorsShow() {
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 2, busy = true, error = "The photo did not upload. Check the connection and try again."), onPick = {}, onBack = {}) } }
        rule.onNodeWithText("2 photos sent to command.").assertIsDisplayed()
        rule.onNodeWithText("The photo did not upload. Check the connection and try again.").assertIsDisplayed()
        rule.onNodeWithText("Choose photos").assertIsNotEnabled()
    }
}
