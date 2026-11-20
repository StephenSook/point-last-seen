package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StatusScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    @Test fun anOpenSearchShowsSearchersAreLookingAndEveryAction() {
        val opened = mutableListOf<Screen>()
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = "drill", killCloud = false, pending = 0, rejected = 0, onOpen = { opened += it }, onRetry = {}, onLeave = {}) } }
        rule.onNodeWithText("Searchers are looking.").assertIsDisplayed()
        rule.onNodeWithText("Training drill. Nobody is missing.").assertIsDisplayed()
        for ((label, screen) in listOf("Share a camera clip" to Screen.CLIP, "Add recent photos" to Screen.PHOTOS, "I remembered something" to Screen.NOTE, "Someone saw them" to Screen.SIGHTING, "About this phone" to Screen.ABOUT)) {
            rule.onNodeWithText(label).performScrollTo().performClick()
        }
        assertEquals(listOf(Screen.CLIP, Screen.PHOTOS, Screen.NOTE, Screen.SIGHTING, Screen.ABOUT), opened)
    }

    @Test fun aFoundIncidentSaysFoundSafeAndOffersNothingToSend() {
        rule.setContent { PaperTheme { StatusScreen(status = "found", mode = null, killCloud = false, pending = 0, rejected = 0, onOpen = {}, onRetry = {}, onLeave = {}) } }
        rule.onNodeWithText("Found. Safe.").assertIsDisplayed()
        rule.onNodeWithText("Share a camera clip").assertDoesNotExist()
        rule.onNodeWithText("Someone saw them").assertDoesNotExist()
    }

    @Test fun aClosedSearchOffersNothingToSend() {
        rule.setContent { PaperTheme { StatusScreen(status = "closed", mode = "drill", killCloud = false, pending = 0, rejected = 0, onOpen = {}, onRetry = {}, onLeave = {}) } }
        rule.onNodeWithText("The search is closed.").assertIsDisplayed()
        rule.onNodeWithText("I remembered something").assertDoesNotExist()
    }

    /** The fixed line: news about the missing person comes from the search lead by phone, never from the app. */
    @Test fun theStatusSaysNewsComesFromTheSearchLeadByPhone() {
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = "drill", killCloud = false, pending = 0, rejected = 0, onOpen = {}, onRetry = {}, onLeave = {}, subjectName = "Mae") } }
        rule.onNodeWithText("News about Mae comes from your search lead by phone, never from this app.").assertIsDisplayed()
    }

    @Test fun unsentItemsAreCounted() {
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = null, killCloud = false, pending = 2, rejected = 0, onOpen = {}, onRetry = {}, onLeave = {}) } }
        rule.onNodeWithText("2 items waiting to send.").assertIsDisplayed()
    }

    @Test fun refusedItemsAreShownWithATryAgain() {
        var retried = 0
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = null, killCloud = false, pending = 0, rejected = 1, onOpen = {}, onRetry = { retried++ }, onLeave = {}) } }
        rule.onNodeWithText("1 item was not accepted.").assertIsDisplayed()
        rule.onNodeWithText("Try again").performScrollTo().performClick()
        assertEquals(1, retried)
    }

    @Test fun theProfileCanBeEditedDuringASearch() {
        val opened = mutableListOf<Screen>()
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = null, killCloud = false, pending = 0, rejected = 0, onOpen = { opened += it }, onRetry = {}, onLeave = {}) } }
        rule.onNodeWithText("Edit profile").performScrollTo().performClick()
        assertEquals(listOf(Screen.PROFILE), opened)
        // Leaving during a search asks first (anOpenSearchAsksBeforeLeaving); the question is not shown until asked.
        rule.onNodeWithText(Copy.LEAVE_CONFIRM).assertDoesNotExist()
    }

    @Test fun aFinishedSearchCanBeLeft() {
        var left = 0
        rule.setContent { PaperTheme { StatusScreen(status = "found", mode = null, killCloud = false, pending = 0, rejected = 0, onOpen = {}, onRetry = {}, onLeave = { left++ }) } }
        rule.onNodeWithText("Leave this search").performScrollTo().performClick()
        assertEquals(1, left)
    }

    /** During a search, leaving asks first; Stay keeps it, Leave leaves. */
    @Test fun anOpenSearchAsksBeforeLeaving() {
        var left = 0
        rule.setContent { PaperTheme { StatusScreen(status = "open", mode = "drill", killCloud = false, pending = 0, rejected = 0, onOpen = {}, onRetry = {}, onLeave = { error("not this one") }, onLeaveOpen = { left++ }) } }
        rule.onNodeWithText("Leave this search").performScrollTo().performClick()
        rule.onNodeWithText(Copy.LEAVE_CONFIRM).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Stay").performScrollTo().performClick()
        rule.onNodeWithText(Copy.LEAVE_CONFIRM).assertDoesNotExist()
        assertEquals(0, left)
        rule.onNodeWithText("Leave this search").performScrollTo().performClick()
        rule.onNodeWithText("Leave").performScrollTo().performClick()
        assertEquals(1, left)
    }
}
