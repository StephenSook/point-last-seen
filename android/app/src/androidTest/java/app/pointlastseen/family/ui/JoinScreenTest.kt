package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class JoinScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun joinIsDisabledUntilACodeIsTypedThenSendsIt() {
        var sent: String? = null
        rule.setContent { PaperTheme { JoinScreen(busy = false, error = null, onJoin = { sent = it }, onBack = {}) } }
        rule.onNodeWithText("Join").assertIsNotEnabled()
        rule.onNodeWithText("Join code").performTextInput("AB12CD")
        rule.onNodeWithText("Join").assertIsEnabled().performClick()
        assertEquals("AB12CD", sent)
    }

    @Test fun joinIsDisabledDuringTheWriteAndTheErrorSitsBesideTheField() {
        rule.setContent { PaperTheme { JoinScreen(busy = true, error = "That code did not work. Check it with command.", onJoin = {}, onBack = {}) } }
        rule.onNodeWithText("Join").assertIsNotEnabled()
        rule.onNodeWithText("That code did not work. Check it with command.").assertIsDisplayed()
    }
}
