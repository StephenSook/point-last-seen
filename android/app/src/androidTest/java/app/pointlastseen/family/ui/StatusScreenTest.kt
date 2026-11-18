package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StatusScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun anOpenSearchShowsSearchersAreLookingAndEveryAction() {
        val opened = mutableListOf<Screen>()
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = "drill", killCloud = false, pending = 0, onOpen = { opened += it }) } }
        rule.onNodeWithText("Searchers are looking.").assertIsDisplayed()
        rule.onNodeWithText("Training drill. Nobody is missing.").assertIsDisplayed()
        for ((label, screen) in listOf("Share a camera clip" to Screen.CLIP, "Add recent photos" to Screen.PHOTOS, "I remembered something" to Screen.NOTE, "Someone saw them" to Screen.SIGHTING, "About this phone" to Screen.ABOUT)) {
            rule.onNodeWithText(label).performScrollTo().performClick()
        }
        assertEquals(listOf(Screen.CLIP, Screen.PHOTOS, Screen.NOTE, Screen.SIGHTING, Screen.ABOUT), opened)
    }

    @Test fun aFoundIncidentSaysFoundSafe() {
        rule.setContent { PaperTheme { StatusScreen(status = "found", mode = null, killCloud = false, pending = 0, onOpen = {}) } }
        rule.onNodeWithText("Found. Safe.").assertIsDisplayed()
    }

    @Test fun unsentItemsAreCounted() {
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = null, killCloud = false, pending = 2, onOpen = {}) } }
        rule.onNodeWithText("2 items waiting to send.").assertIsDisplayed()
    }
}
