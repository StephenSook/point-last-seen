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
class UpdateScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun anOldBuildSaysToUpdateAndOpensTheDownloadPage() {
        var opened = 0
        rule.setContent { PaperTheme { UpdateScreen(mode = "drill", onOpenDownloads = { opened++ }) } }
        rule.onNodeWithText("This app needs an update.").assertIsDisplayed()
        rule.onNodeWithText("Training drill. Nobody is missing.").assertIsDisplayed()
        rule.onNodeWithText("Open the download page").performClick()
        assertEquals(1, opened)
    }
}
