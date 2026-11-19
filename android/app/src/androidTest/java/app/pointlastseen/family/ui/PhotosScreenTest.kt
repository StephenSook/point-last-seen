package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
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

    /** Command's cloud read of the photos is off until the family ticks it. */
    @Test fun theCloudReadTickIsOffUntilTicked() {
        val ticks = mutableListOf<Boolean>()
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 0, busy = false, error = null), onPick = {}, onBack = {}, onCloudRead = { ticks += it }) } }
        rule.onNodeWithText("Command may read these photos in the cloud").assertIsOff().performClick()
        assertEquals(listOf(true), ticks)
    }

    @Test fun aCloudReadThatWasNotSavedIsSaid() {
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 1, busy = false, error = null, cloudRead = true, notSaved = 1), onPick = {}, onBack = {}) } }
        rule.onNodeWithText("The cloud read was not saved for 1 photo. Command can still see it.").assertIsDisplayed()
    }

    /** The family can withdraw command's cloud read of the photos this phone allowed, and is told the result. */
    @Test fun theCloudReadCanBeWithdrawn() {
        var withdrew = 0
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 2, busy = false, error = null, consented = 2, withdrawNote = "The cloud read is off for 1 photo."), onPick = {}, onBack = {}, onWithdraw = { withdrew++ }) } }
        rule.onNodeWithText("The cloud read is off for 1 photo.").assertIsDisplayed()
        rule.onNodeWithText("Stop command's cloud read of these photos").performClick()
        assertEquals(1, withdrew)
    }

    @Test fun withNoAllowedPhotosThereIsNothingToWithdraw() {
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 1, busy = false, error = null), onPick = {}, onBack = {}) } }
        rule.onNodeWithText("Stop command's cloud read of these photos").assertDoesNotExist()
    }

    @Test fun progressAndErrorsShow() {
        rule.setContent { PaperTheme { PhotosScreen(null, false, PhotosUi(uploaded = 2, busy = true, error = "The photo did not upload. Check the connection and try again."), onPick = {}, onBack = {}) } }
        rule.onNodeWithText("2 photos sent to command.").assertIsDisplayed()
        rule.onNodeWithText("The photo did not upload. Check the connection and try again.").assertIsDisplayed()
        rule.onNodeWithText("Choose photos").assertIsNotEnabled()
    }
}
