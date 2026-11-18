package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ComponentsTest {
    @get:Rule val rule = createComposeRule()

    @Test fun aDrillScreenShowsTheDrillLineAndTheKillCloudBanner() {
        rule.setContent {
            PaperTheme { FamilyScaffold(mode = "drill", killCloud = true) { Sentence("Searchers are looking.") } }
        }
        rule.onNodeWithText("Training drill. Nobody is missing.").assertIsDisplayed()
        rule.onNodeWithText(Copy.KILL_CLOUD).assertIsDisplayed()
        rule.onNodeWithText("Searchers are looking.").assertIsDisplayed()
    }

    @Test fun aRealIncidentShowsNoDrillLine() {
        rule.setContent { PaperTheme { FamilyScaffold(mode = null, killCloud = false) { Sentence("Call 911 first.") } } }
        rule.onNodeWithText("Training drill. Nobody is missing.").assertDoesNotExist()
        rule.onNodeWithText(Copy.KILL_CLOUD).assertDoesNotExist()
    }
}
