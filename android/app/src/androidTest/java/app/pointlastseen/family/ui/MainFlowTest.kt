package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.MainActivity
import org.junit.BeforeClass
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The real activity and view model, before joining: profile, She's gone, call first, join. */
@RunWith(AndroidJUnit4::class)
class MainFlowTest {
    companion object {
        @JvmStatic @BeforeClass fun freshInstall() {
            val c = InstrumentationRegistry.getInstrumentation().targetContext
            for (name in listOf("pls", "pls-profile")) c.getSharedPreferences(name, 0).edit().clear().commit()
        }
    }

    @get:Rule val rule = createAndroidComposeRule<MainActivity>()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    @Test fun shesGoneLeadsToCallFirstThenTheJoinScreen() {
        rule.onNodeWithText("Who might go missing?").assertIsDisplayed()
        rule.onNodeWithText("She's gone").performScrollTo().performClick()
        rule.onNodeWithText("Call 911 first.").assertIsDisplayed()
        rule.onNodeWithText("I called").performScrollTo().performClick()
        rule.onNodeWithText("Type the code from command.").assertIsDisplayed()
    }
}
