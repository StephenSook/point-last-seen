package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NoteScreenTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()
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
        rule.onNodeWithText("Send this note to the cloud to sort it?").assertIsDisplayed()
        rule.onNodeWithText("This phone has no on-device model.").assertIsDisplayed()
        rule.onNodeWithText("Or sort it yourself, on this phone:").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Send to the cloud").performScrollTo().performClick()
        assertEquals("old mill" to true, sent)
    }

    /** The family's job comes first: the note field and Sort it, then the model's line and its offer. */
    @Test fun theNoteFieldComesBeforeTheModelOffer() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}, model = ModelState(DeviceModelStatus.DOWNLOADABLE)) } }
        fun top(text: String) = rule.onNodeWithText(text).getBoundsInRoot().top
        assertTrue(top("What did you remember?") < top("Sort it"))
        assertTrue(top("Sort it") < top("An on-device model can be downloaded to this phone."))
        assertTrue(top("An on-device model can be downloaded to this phone.") < top("Get the on-device model"))
    }

    @Test fun theNoteScreenSaysWhenTheModelIsReadyOnThisPhone() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}, model = ModelState(DeviceModelStatus.AVAILABLE)) } }
        rule.onNodeWithText("Ready on this phone.").performScrollTo().assertIsDisplayed()
    }

    @Test fun withADownloadableModelTheConsentQuestionOffersTheModel() {
        var asked = false
        rule.setContent {
            PaperTheme {
                NoteScreen(
                    null, false, NoteUi.Done(NoteOutcome.NeedsConsent, "old mill"), onSort = { _, _ -> }, onAdd = {}, onBack = {},
                    model = ModelState(DeviceModelStatus.DOWNLOADABLE), onGetModel = { asked = true },
                )
            }
        }
        rule.onNodeWithText("Send this note to the cloud to sort it?").assertIsDisplayed()
        rule.onNodeWithText("An on-device model can be downloaded to this phone.").assertIsDisplayed()
        rule.onNodeWithText("Get the on-device model").performScrollTo().performClick()
        assertTrue(asked)
    }

    @Test fun onceTheModelIsReadyTheConsentQuestionSortsTheSameNoteOnThisPhone() {
        var sent: Pair<String, Boolean>? = null
        rule.setContent {
            PaperTheme {
                NoteScreen(
                    null, false, NoteUi.Done(NoteOutcome.NeedsConsent, "old mill"), onSort = { t, c -> sent = t to c }, onAdd = {}, onBack = {},
                    model = ModelState(DeviceModelStatus.AVAILABLE),
                )
            }
        }
        rule.onNodeWithText("Ready on this phone.").assertIsDisplayed()
        rule.onNodeWithText("Send to the cloud").assertDoesNotExist()
        rule.onNodeWithText("Sort it on this phone").performScrollTo().performClick()
        assertEquals("old mill" to false, sent)
    }

    @Test fun aFailedDownloadShowsOnTheNoteScreen() {
        rule.setContent {
            PaperTheme {
                NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}, model = ModelState(DeviceModelStatus.DOWNLOADABLE, downloadFailed = true))
            }
        }
        rule.onNodeWithText(Copy.MODEL_FAILED).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Get the on-device model").performScrollTo().assertIsDisplayed()
    }

    @Test fun aFailedDownloadStillShowsWhenTheStatusIsUnknown() {
        rule.setContent {
            PaperTheme {
                NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}, model = ModelState(DeviceModelStatus.UNKNOWN, downloadFailed = true))
            }
        }
        rule.onNodeWithText(Copy.MODEL_FAILED).performScrollTo().assertIsDisplayed()
    }

    @Test fun aSuggestionIsLabelledEditableAndShowsWhereItWasRead() {
        var added: FamilyNoteReading? = null
        val read = NoteOutcome.Read(FamilyNoteReading("place", "The old mill", "s", "old mill"), route, "old mill", DeviceModelStatus.UNAVAILABLE)
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(read, "old mill"), onSort = { _, _ -> }, onAdd = { added = it }, onBack = {}) } }
        rule.onNodeWithText("Suggested: a place they like to go").assertIsDisplayed()
        rule.onNodeWithText("Read in the cloud in 0.9 s. This phone has no on-device model.").assertIsDisplayed()
        rule.onNodeWithText("The old mill").performTextReplacement("Old mill on Route 9")
        rule.onNodeWithText("Add to profile").performScrollTo().performClick()
        assertEquals(FamilyNoteReading("place", "Old mill on Route 9", "s", "old mill"), added)
    }

    @Test fun aReadOnThisPhoneSaysSoWithItsTime() {
        val local = RouteRecord("android", "on_device", "sdk", "gemini-nano (ML Kit Prompt API)", "on_device_default", 1234, true, null, 1)
        val read = NoteOutcome.Read(FamilyNoteReading("place", "The old mill", "s", "old mill"), local, "old mill", DeviceModelStatus.AVAILABLE)
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(read, "old mill"), onSort = { _, _ -> }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText("Read on this phone in 1.2 s.").assertIsDisplayed()
    }

    @Test fun possibleEvidenceShowsTheProtocolAndNoModelResult() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(NoteOutcome.PossibleEvidence, "blood"), onSort = { _, _ -> }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText(Copy.EVIDENCE).assertIsDisplayed()
        rule.onNodeWithText("Add to profile").assertDoesNotExist()
    }

    /** A note that does not look English says it is not sent to the cloud, and offers the hand-entry choices. */
    @Test fun aNoteThatDoesNotLookEnglishSaysSoAndOffersHandEntry() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Done(NoteOutcome.NotEnglish, "Abuela salio de la casa"), onSort = { _, _ -> }, onAdd = {}, onBack = {}) } }
        rule.onNodeWithText("This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand.").assertIsDisplayed()
        rule.onNodeWithText("Add to profile").performScrollTo().assertIsDisplayed()
    }

    @Test fun whenItCannotBeSortedTheFamilyPicksTheKind() {
        var added: FamilyNoteReading? = null
        rule.setContent { PaperTheme { NoteScreen(null, true, NoteUi.Done(NoteOutcome.FillByHand, "red scarf"), onSort = { _, _ -> }, onAdd = { added = it }, onBack = {}) } }
        rule.onNodeWithText("Clothing").performScrollTo().performClick()
        rule.onNodeWithText("Add to profile").performScrollTo().performClick()
        assertEquals("clothing", added!!.kind)
        assertEquals("red scarf", added!!.label)
    }

    @Test fun theNoteFieldIsFocusedSoTheKeyboardMicIsOneTapAway() {
        rule.setContent { PaperTheme { NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}) } }
        rule.onNode(hasSetTextAction()).assertIsFocused()
    }
}
