package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CallFirstScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun aDrillSaysTheDrillCallTakerAndOffersNoDialer() {
        var done = 0
        rule.setContent { PaperTheme { CallFirstScreen(mode = "drill", killCloud = false, onDial = { error("no dialer in a drill") }, onDone = { done++ }) } }
        rule.onNodeWithText("Training drill. Call the drill call-taker, not 911.").assertIsDisplayed()
        rule.onNodeWithText("Call 911").assertDoesNotExist()
        rule.onNodeWithText("I called").performClick()
        assertEquals(1, done)
    }

    @Test fun aRealIncidentSaysCall911FirstAndOffersTheDialer() {
        var dialed = 0
        rule.setContent { PaperTheme { CallFirstScreen(mode = null, killCloud = false, onDial = { dialed++ }, onDone = {}) } }
        rule.onNodeWithText("Call 911 first.").assertIsDisplayed()
        rule.onNodeWithText("Call 911").performClick()
        assertEquals(1, dialed)
    }

    @Test fun beforeJoiningTheScreenAlsoSaysWhatToDoInADrill() {
        rule.setContent { PaperTheme { CallFirstScreen(mode = null, killCloud = false, onDial = {}, onDone = {}) } }
        rule.onNodeWithText("Call 911 first.").assertIsDisplayed()
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
