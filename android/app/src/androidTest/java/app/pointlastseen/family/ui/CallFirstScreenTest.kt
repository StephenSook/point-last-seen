package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
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
class CallFirstScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    /** A drill or judge incident keeps its drill line and shows the guidance with the dialer disabled. */
    @Test fun aDrillShowsTheGuidanceWithTheDialerDisabled() {
        var done = 0
        rule.setContent { PaperTheme { CallFirstScreen(mode = "drill", killCloud = false, onDial = { error("no dialer in a drill") }, onDone = { done++ }) } }
        rule.onNodeWithText("Training drill. Call the drill call-taker, not 911.").assertIsDisplayed()
        rule.onNodeWithText("Look in the immediate area now. If you don't find them within 5 minutes, call 911.").assertIsDisplayed()
        rule.onNodeWithText("Call 911").assertIsNotEnabled()
        rule.onNodeWithText("I called").performClick()
        assertEquals(1, done)
    }

    @Test fun aJudgeIncidentAlsoDisablesTheDialer() {
        rule.setContent { PaperTheme { CallFirstScreen(mode = "judge", killCloud = false, onDial = { error("no dialer for judges") }, onDone = {}) } }
        rule.onNodeWithText("Training drill. Call the drill call-taker, not 911.").assertIsDisplayed()
        rule.onNodeWithText("Call 911").assertIsNotEnabled()
    }

    /** A real incident: look nearby now, call 911 within five minutes, with her name on the advice and the dialer on. */
    @Test fun aRealIncidentGivesTheFirstMinutesGuidanceAndTheDialer() {
        var dialed = 0
        rule.setContent { PaperTheme { CallFirstScreen(mode = null, killCloud = false, onDial = { dialed++ }, onDone = {}) } }
        rule.onNodeWithText("Look in the immediate area now. If you don't find them within 5 minutes, call 911.").assertIsDisplayed()
        rule.onNodeWithText("Guidance from Kim Franklin, Alzheimer's Association Georgia").assertIsDisplayed()
        rule.onNodeWithText("Call 911").assertIsEnabled().performClick()
        assertEquals(1, dialed)
    }

    @Test fun beforeJoiningTheScreenAlsoSaysWhatToDoInADrill() {
        rule.setContent { PaperTheme { CallFirstScreen(mode = null, killCloud = false, onDial = {}, onDone = {}) } }
        rule.onNodeWithText("Look in the immediate area now. If you don't find them within 5 minutes, call 911.").assertIsDisplayed()
        rule.onNodeWithText("In a training drill, call the drill call-taker, not 911.").assertIsDisplayed()
    }

    @Test fun aJoinedDrillDoesNotRepeatTheUnjoinedLine() {
        rule.setContent { PaperTheme { CallFirstScreen(mode = "drill", killCloud = false, onDial = {}, onDone = {}) } }
        rule.onNodeWithText("In a training drill, call the drill call-taker, not 911.").assertDoesNotExist()
    }

    @Test fun withoutTheScriptFlagThereIsNoScriptButton() {
        rule.setContent { PaperTheme { CallFirstScreen(mode = "drill", killCloud = false, onDial = {}, onDone = {}) } }
        rule.onNodeWithText("What to say").assertDoesNotExist()
    }

    @Test fun withTheScriptFlagTheScriptOpens() {
        var opened = 0
        rule.setContent { PaperTheme { CallFirstScreen(mode = "drill", killCloud = false, onDial = {}, onDone = {}, onScript = { opened++ }) } }
        rule.onNodeWithText("What to say").performClick()
        assertEquals(1, opened)
    }
}
