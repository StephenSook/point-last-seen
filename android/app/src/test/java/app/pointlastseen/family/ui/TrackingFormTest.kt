package app.pointlastseen.family.ui

import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.TrackingAids
import app.pointlastseen.family.shared.SharedFiles
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingFormTest {
    /** The form's labels, in card order, are the shared file's (a missing file fails, never skips). */
    @Test fun theLabelsAreTheSharedFilesInCardOrder() {
        val aids = SharedFiles.json("shared/constants/tracking-aids.json").jsonObject.getValue("aids").jsonArray.map { it.jsonObject }
        assertEquals(aids.map { it.getValue("id").jsonPrimitive.content }, Profiles.TRACKING_AIDS)
        assertEquals(aids.map { it.getValue("label").jsonPrimitive.content }, Profiles.TRACKING_AIDS.map { TrackingForm.LABELS.getValue(it) })
    }

    @Test fun theNoteCapIsTheSharedFiles() {
        assertEquals(SharedFiles.json("shared/constants/tracking-aids.json").jsonObject.getValue("noteMaxChars").jsonPrimitive.content.toInt(), Profiles.MAX_TRACKING_NOTE)
    }

    /** Ticking an aid answers the question; unticking keeps the answer, so the family's "none" is not lost to "unknown". */
    @Test fun tickingAnAidAnswersTheQuestion() {
        val one = TrackingForm.toggle(null, "gps_tracker")
        assertEquals(TrackingAids(listOf("gps_tracker"), ""), one)
        assertEquals(TrackingAids(listOf("gps_tracker", "project_lifesaver"), ""), TrackingForm.toggle(one, "project_lifesaver"))
        assertEquals(TrackingAids(emptyList(), ""), TrackingForm.toggle(one, "gps_tracker"))
    }

    /** "None of these" clears the aids and keeps the note; it is shown only for an answered, empty list. */
    @Test fun noneOfTheseIsAnAnswer() {
        assertFalse(TrackingForm.isNone(null))
        val none = TrackingForm.none(TrackingAids(listOf("gps_tracker"), "Pocket"))
        assertEquals(TrackingAids(emptyList(), "Pocket"), none)
        assertTrue(TrackingForm.isNone(none))
        assertFalse(TrackingForm.isNone(TrackingAids(listOf("medicalert_id"), "")))
    }

    @Test fun typingANoteAnswersTheQuestionAndKeepsTheAids() {
        assertEquals(TrackingAids(emptyList(), "Wrist unit"), TrackingForm.note(null, "Wrist unit"))
        assertEquals(TrackingAids(listOf("gps_tracker"), "In his coat"), TrackingForm.note(TrackingAids(listOf("gps_tracker"), ""), "In his coat"))
    }

    /** A number in the note gets a plain reason (fullwidth digits too), and a clean note none. */
    @Test fun aNumberInTheNoteGetsAPlainReason() {
        assertEquals(TrackingForm.NO_NUMBERS, TrackingForm.noteProblem("Unit 4"))
        assertEquals(TrackingForm.NO_NUMBERS, TrackingForm.noteProblem("Unit ４"))
        assertNull(TrackingForm.noteProblem("County gave her a wrist unit"))
        assertEquals("Leave out numbers: no phone or serial numbers go on the search card.", TrackingForm.NO_NUMBERS)
    }
}
