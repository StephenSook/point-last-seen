package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NoteScreenTest {
    @get:Rule val rule = createComposeRule()
    private val route = RouteRecord("android", "cloud", "sdk", "m", "on_device_unavailable", 900, true, null, 1)

    @Test fun sortingSendsTheTypedNote() {
        var sent: Pair<String, Boolean>? = null
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Idle, onSort = { t, c -> sent = t to c }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText("What did you remember?").performTextInput("She used to walk to the old mill")
        rule.onNodeWithText("Sort it").performClick()
        assertEquals("She used to walk to the old mill" to false, sent)
    }

    @Test fun withNoLocalModelTheFamilyIsAskedBeforeTheCloud() {
        var sent: Pair<String, Boolean>? = null
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(NoteOutcome.NeedsConsent, "old mill"), onSort = { t, c -> sent = t to c }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText("This phone has no on-device model. Send this note to the cloud to sort it?").assertIsDisplayed()
        rule.onNodeWithText("Or sort it yourself, on this phone:").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Send to the cloud").performScrollTo().performClick()
        assertEquals("old mill" to true, sent)
    }

    @Test fun aSuggestionIsLabelledEditableAndShowsWhereItWasRead() {
        var added: FamilyNoteReading? = null
        val read = NoteOutcome.Read(FamilyNoteReading("place", "The old mill", "s", "old mill"), route, "old mill")
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(read, "old mill"), onSort = { _, _ -> }, onAdd = { added = it }, onBack = {}) } }
        rule.onNodeWithText("Suggested: a place they like to go").assertIsDisplayed()
        rule.onNodeWithText("Read in the cloud").assertIsDisplayed()
        rule.onNodeWithText("The old mill").performTextReplacement("Old mill on Route 9")
        rule.onNodeWithText("Add to profile").performScrollTo().performClick()
        assertEquals(FamilyNoteReading("place", "Old mill on Route 9", "s", "old mill"), added)
    }

    @Test fun possibleEvidenceShowsTheProtocolAndNoModelResult() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(NoteOutcome.PossibleEvidence, "blood"), onSort = { _, _ -> }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText(Copy.EVIDENCE).assertIsDisplayed()
        rule.onNodeWithText("Add to profile").assertDoesNotExist()
    }

    @Test fun whenItCannotBeSortedTheFamilyPicksTheKind() {
        var added: FamilyNoteReading? = null
        rule.setContent { PaperTheme { NoteScreen(null, true, NoteUi.Done(NoteOutcome.FillByHand, "red scarf"), onSort = { _, _ -> }, onAdd = { added = it }, onBack = {}) } }
        rule.onNodeWithText("Clothing").performScrollTo().performClick()
        rule.onNodeWithText("Add to profile").performScrollTo().performClick()
        assertEquals("clothing", added!!.kind)
        assertEquals("red scarf", added!!.label)
    }
}
