package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class QuestionScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    @Test fun theQuestionIsShownAndTheAnswerIsSentOnce() {
        val sent = mutableListOf<String>()
        rule.setContent { PaperTheme { QuestionScreen(null, false, QuestionUi(text = "Does she have a favourite bench?"), onSend = { sent += it }, onBack = {}) } }
        rule.onNodeWithText("The search lead asks:").assertIsDisplayed()
        rule.onNodeWithText("Does she have a favourite bench?").assertIsDisplayed()
        rule.onNodeWithText("Send answer").assertIsNotEnabled()
        rule.onNodeWithText("Your answer").performTextInput("The one by the duck pond.")
        rule.onNodeWithText("Send answer").performClick()
        assertEquals(listOf("The one by the duck pond."), sent)
    }

    /** An answered question shows the answer and offers no second one. */
    @Test fun anAnsweredQuestionShowsItsAnswerAndNoField() {
        rule.setContent { PaperTheme { QuestionScreen(null, false, QuestionUi(text = "Does she have a favourite bench?", answer = "The one by the duck pond."), onSend = {}, onBack = {}) } }
        rule.onNodeWithText("Your answer was sent:").assertIsDisplayed()
        rule.onNodeWithText("The one by the duck pond.").assertIsDisplayed()
        rule.onNodeWithText("Send answer").assertDoesNotExist()
    }

    @Test fun whileLoadingTheQuestionTheScreenSaysSo() {
        rule.setContent { PaperTheme { QuestionScreen(null, false, QuestionUi(loading = true), onSend = {}, onBack = {}) } }
        rule.onNodeWithText("Getting the question.").assertIsDisplayed()
    }
}
