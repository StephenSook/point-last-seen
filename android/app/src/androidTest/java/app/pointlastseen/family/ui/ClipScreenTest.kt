package app.pointlastseen.family.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClipScreenTest {
    @get:Rule val rule = createComposeRule()

    private fun tick(label: String) = rule.onNodeWithText(label).performScrollTo().performClick()

    @Test fun readNeedsAClipTheThreeConsentsAndTheClock() {
        var form: ClipForm? = null
        rule.setContent { PaperTheme { ClipScreen(null, false, clipLabel = "door.mp4", ui = ClipUi.Idle, onPick = {}, onRead = { form = it }, onConfirm = {}, onBack = {}) } }
        val read = rule.onNodeWithText("Read the clip")
        read.performScrollTo().assertIsNotEnabled()
        tick("The person in the clip agrees")
        tick("I own this footage or have the owner's OK")
        tick("Send it to the cloud to read it")
        read.performScrollTo().assertIsNotEnabled()
        rule.onNodeWithText("When the clip starts (HH:MM)").performScrollTo().performTextInput("14:01")
        tick("The camera's clock is right")
        tick("west")
        read.performScrollTo().assertIsEnabled().performClick()
        val f = form!!
        assertEquals(true, f.personInClip && f.footageOwner && f.cloudProcessing && f.clockConfirmed)
        assertEquals(false, f.publicUse)
        assertEquals(14 * 60 + 1, f.startMinuteOfDay)
        assertEquals(270, f.facingDeg)
    }

    @Test fun whileReadingTheScreenSaysSoAndBackStaysAvailable() {
        var back = 0
        rule.setContent { PaperTheme { ClipScreen(null, false, "door.mp4", ClipUi.Busy, onPick = {}, onRead = {}, onConfirm = {}, onBack = { back++ }) } }
        rule.onNodeWithText("Reading the clip. This can take a minute.").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Back").performScrollTo().performClick()
        assertEquals(1, back)
    }

    @Test fun theCardIsLabelledSuggested() {
        val card = ClipCard("14:03", "west", "blue top", "Read in the cloud", cached = false, frameTime = "00:05")
        rule.setContent { PaperTheme { ClipScreen(null, false, "door.mp4", ClipUi.Read(card), {}, {}, {}, {}) } }
        rule.onNodeWithText("Suggested from the clip").assertIsDisplayed()
    }

    @Test fun consentTicksDoNotCarryOverToANewClip() {
        val label = androidx.compose.runtime.mutableStateOf("door.mp4")
        rule.setContent { PaperTheme { ClipScreen(null, false, clipLabel = label.value, ui = ClipUi.Idle, onPick = {}, onRead = {}, onConfirm = {}, onBack = {}) } }
        tick("The person in the clip agrees")
        tick("I own this footage or have the owner's OK")
        tick("Send it to the cloud to read it")
        rule.onNodeWithText("When the clip starts (HH:MM)").performScrollTo().performTextInput("14:01")
        tick("The camera's clock is right")
        rule.onNodeWithText("Read the clip").performScrollTo().assertIsEnabled()
        label.value = "garage.mp4"
        rule.waitForIdle()
        rule.onNodeWithText("Read the clip").performScrollTo().assertIsNotEnabled()
    }

    @Test fun withNoClipChosenTheFamilyIsAskedToPickOne() {
        var picked = 0
        rule.setContent { PaperTheme { ClipScreen(null, false, clipLabel = null, ui = ClipUi.Idle, onPick = { picked++ }, onRead = {}, onConfirm = {}, onBack = {}) } }
        rule.onNodeWithText("Choose a clip").performClick()
        assertEquals(1, picked)
    }

    @Test fun aReadClipShowsTheCardAndConfirm() {
        var confirmed = 0
        val card = ClipCard(lastSeen = "14:03", direction = "west", clothing = "blue top, black bottom", route = "Read in the cloud", cached = false, frameTime = "00:05")
        rule.setContent { PaperTheme { ClipScreen(null, false, "door.mp4", ClipUi.Read(card), onPick = {}, onRead = {}, onConfirm = { confirmed++ }, onBack = {}) } }
        rule.onNodeWithText("Last seen 14:03").assertIsDisplayed()
        rule.onNodeWithText("Walking west").assertIsDisplayed()
        rule.onNodeWithText("Wearing blue top, black bottom").assertIsDisplayed()
        rule.onNodeWithText("Read in the cloud").assertIsDisplayed()
        rule.onNodeWithText("See the frame").performScrollTo().performClick()
        rule.onNodeWithText("Frame at 00:05").assertIsDisplayed()
        rule.onNodeWithText("Confirm").performScrollTo().performClick()
        assertEquals(1, confirmed)
    }

    @Test fun aClipReadBeforeSaysNoNewCloudCall() {
        val card = ClipCard("14:03", null, "unknown top", "Read in the cloud", cached = true, frameTime = "00:05")
        rule.setContent { PaperTheme { ClipScreen(null, false, "door.mp4", ClipUi.Read(card), {}, {}, {}, {}) } }
        rule.onNodeWithText("Read before. No new cloud call.").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Direction not known").assertIsDisplayed()
    }

    @Test fun aFailedReadSaysCouldNotReadAndOffersNoConfirm() {
        rule.setContent { PaperTheme { ClipScreen(null, false, "door.mp4", ClipUi.Done(ClipOutcome.CouldNotRead), {}, {}, {}, {}) } }
        rule.onNodeWithText("Couldn't read").assertIsDisplayed()
        rule.onNodeWithText("Confirm").assertDoesNotExist()
    }

    @Test fun aRefusalShowsItsReason() {
        rule.setContent { PaperTheme { ClipScreen(null, true, "door.mp4", ClipUi.Done(ClipOutcome.Refused("Clip reading is paused right now. Tell command about the clip.")), {}, {}, {}, {}) } }
        rule.onNodeWithText("Clip reading is paused right now. Tell command about the clip.").assertIsDisplayed()
    }
}
