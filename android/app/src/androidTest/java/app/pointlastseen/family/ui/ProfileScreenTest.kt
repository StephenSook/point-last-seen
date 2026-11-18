package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProfileScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()

    private fun type(label: String, text: String) = rule.onNodeWithText(label).performScrollTo().performTextInput(text)
    private fun tap(label: String) = rule.onNodeWithText(label).performScrollTo().performClick()

    @Test fun editsReachSaveAndShesGone() {
        var saved: SubjectProfile? = null
        var gone: SubjectProfile? = null
        rule.setContent {
            PaperTheme {
                ProfileScreen(SubjectProfile(), warnings = emptyList(), joined = false, mode = null,
                    onSave = { saved = it }, onGone = { gone = it }, onJoin = {}, gone = false, onBack = {})
            }
        }
        type("Name they answer to", "Mae")
        type("Age", "82")
        type("Height (feet)", "5")
        type("Height (inches)", "2")
        tap("cane")
        tap("May hide")
        type("Medicines", "donepezil")
        type("Places they go", "Grace Church")
        tap("Save")
        val s = saved!!
        assertEquals("Mae", s.answersTo)
        assertEquals(82, s.ageYears)
        assertEquals(5, s.heightFt)
        assertEquals(2, s.heightIn)
        assertTrue("cane" in s.mobilityAids)
        assertTrue("likelyToHide" in s.flags && "mayNotRespond" in s.flags)
        assertEquals("donepezil", s.medications)
        assertEquals("Grace Church", s.placesFrequented.single().label)
        tap("She's gone")
        assertEquals(s, gone)
    }

    @Test fun theDementiaTypeIsSharedOnlyWhenSwitchedOn() {
        var saved: SubjectProfile? = null
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), emptyList(), true, "drill", onSave = { saved = it }, onGone = {}, onJoin = {}, gone = false, onBack = {}) } }
        tap("Lewy body")
        tap("Save")
        assertEquals("lewy_body", saved!!.dementiaType)
        assertEquals(false, saved!!.shareDementiaType)
        tap("Share the type with searchers")
        tap("Save")
        assertEquals(true, saved!!.shareDementiaType)
    }

    @Test fun theSectionsSayWhoSeesWhat() {
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), emptyList(), false, null, {}, {}, {}, gone = false, onBack = {}) } }
        rule.onNodeWithText("Stays on this phone").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Only command sees this").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Join with a code").performScrollTo().assertIsDisplayed()
    }

    @Test fun warningsShowAtTheTop() {
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), listOf("photo_old", "clock_changed"), true, "drill", {}, {}, {}, gone = false, onBack = {}) } }
        rule.onNodeWithText("The photo is more than two months old. Add a new one.").assertIsDisplayed()
        rule.onNodeWithText("The clocks changed. Please check this profile.").assertIsDisplayed()
        rule.onNodeWithText("Join with a code").assertDoesNotExist()
    }

    @Test fun duringASearchTheProfileHasBackNotShesGone() {
        var back = 0
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), emptyList(), true, "drill", {}, {}, {}, gone = true, onBack = { back++ }) } }
        rule.onNodeWithText("She's gone").assertDoesNotExist()
        rule.onNodeWithText("Back").performScrollTo().performClick()
        assertEquals(1, back)
    }

    @Test fun joiningKeepsWhatWasTyped() {
        var joinedWith: SubjectProfile? = null
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), emptyList(), false, null, {}, {}, onJoin = { joinedWith = it }, gone = false, onBack = {}) } }
        type("Name they answer to", "Mae")
        tap("Join with a code")
        assertEquals("Mae", joinedWith!!.answersTo)
    }

    @Test fun goneButNotJoinedStillOffersJoin() {
        var joins = 0
        rule.setContent { PaperTheme { ProfileScreen(SubjectProfile(), emptyList(), joined = false, mode = null, onSave = {}, onGone = {}, onJoin = { joins++ }, gone = true, onBack = {}) } }
        rule.onNodeWithText("She's gone").assertDoesNotExist()
        tap("Join with a code")
        assertEquals(1, joins)
    }
}
