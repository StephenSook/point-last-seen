package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.FamilySightingInput
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SightingScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()
    private val now = 10_000_000L

    @Test fun theFormWarnsAgainstTypingTheCallersName() {
        rule.setContent { PaperTheme { SightingScreen(null, false, busy = false, error = null, nowMs = { now }, onSend = {}, onBack = {}) } }
        rule.onNodeWithText("Do not type the caller's name.").performScrollTo().assertIsDisplayed()
    }

    @Test fun sendNeedsATimeAndAPlaceThenCarriesWhatWasTyped() {
        var sent: FamilySightingInput? = null
        rule.setContent { PaperTheme { SightingScreen(null, false, busy = false, error = null, nowMs = { now }, onSend = { sent = it }, onBack = {}) } }
        rule.onNodeWithText("Send to command").performScrollTo().assertIsNotEnabled()
        rule.onNodeWithText("30 min ago").performScrollTo().performClick()
        rule.onNodeWithText("Where").performScrollTo().performTextInput("gas station on Elm")
        rule.onNodeWithText("North").performScrollTo().performClick()
        rule.onNodeWithText("Top: blue").performScrollTo().performClick()
        rule.onNodeWithText("What they said").performScrollTo().performTextInput("saw her walking fast")
        rule.onNodeWithText("Send to command").performScrollTo().assertIsEnabled().performClick()
        val s = sent!!
        assertEquals(now - 30 * 60_000L, s.observedAtMs)
        assertEquals("gas station on Elm", s.place)
        assertEquals("n", s.direction)
        assertEquals("blue", s.topColor)
        assertEquals("saw her walking fast", s.note)
    }

    @Test fun sendIsDisabledDuringTheWrite() {
        rule.setContent { PaperTheme { SightingScreen(null, false, busy = true, error = null, nowMs = { now }, onSend = {}, onBack = {}) } }
        rule.onNodeWithText("Send to command").performScrollTo().assertIsNotEnabled()
    }

    @Test fun aSendThatFailedSaysWhyBesideTheButton() {
        rule.setContent { PaperTheme { SightingScreen(null, false, busy = false, error = "Join the search first.", nowMs = { now }, onSend = {}, onBack = {}) } }
        rule.onNodeWithText("Join the search first.").performScrollTo().assertIsDisplayed()
    }
}
