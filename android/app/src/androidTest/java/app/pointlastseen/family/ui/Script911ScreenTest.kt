package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Script911ScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()
    private val p = SubjectProfile(answersTo = "Mae", ageYears = 82)

    @Test fun inADrillTheScriptSaysDoNotDial911() {
        var back = 0
        rule.setContent { PaperTheme { Script911Screen(p, mode = "drill", killCloud = false, onBack = { back++ }) } }
        rule.onNodeWithText("Training drill. Do not dial 911.").assertIsDisplayed()
        rule.onNodeWithText("A person with dementia is missing. Their name is Mae.").assertIsDisplayed()
        rule.onNodeWithText("Back").performClick()
        assertEquals(1, back)
    }

    @Test fun outsideADrillItSaysWhatToTellTheCallTaker() {
        rule.setContent { PaperTheme { Script911Screen(p, mode = null, killCloud = false, onBack = {}) } }
        rule.onNodeWithText("Tell the call-taker:").assertIsDisplayed()
        rule.onNodeWithText("Training drill. Do not dial 911.").assertDoesNotExist()
    }
}
