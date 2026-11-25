package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus
import org.junit.Assert.assertEquals
import org.junit.Test

/** While a note is read, the screen keeps the note and says where it is read, by the same rules as FamilyNote.read. */
class NoteBusyTest {
    private val note = "She used to walk to the old mill"

    @Test fun theNoteBeingReadIsKept() {
        assertEquals(note, NoteUi.busy(note, consent = true, killCloud = false, status = DeviceModelStatus.UNAVAILABLE).text)
    }

    /** No consent: any model call is device-only. */
    @Test fun withoutConsentItIsReadOnThisPhone() {
        for (s in DeviceModelStatus.entries) {
            assertEquals(s.name, NoteUi.Where.PHONE, NoteUi.busy(note, consent = false, killCloud = false, status = s).where)
        }
    }

    /** Cloud reading paused: any model call is device-only, even with consent. */
    @Test fun withTheCloudPausedItIsReadOnThisPhone() {
        for (s in DeviceModelStatus.entries) {
            assertEquals(s.name, NoteUi.Where.PHONE, NoteUi.busy(note, consent = true, killCloud = true, status = s).where)
        }
    }

    /** Consent and no ready model: the read goes to the cloud. */
    @Test fun withConsentAndNoReadyModelItIsReadInTheCloud() {
        for (s in DeviceModelStatus.entries.filter { it != DeviceModelStatus.AVAILABLE }) {
            assertEquals(s.name, NoteUi.Where.CLOUD, NoteUi.busy(note, consent = true, killCloud = false, status = s).where)
        }
    }

    /** Consent and a ready model: the SDK prefers the phone and may fall back to the cloud, so the line names neither. */
    @Test fun withConsentAndAReadyModelTheLineNamesNeither() {
        assertEquals(NoteUi.Where.EITHER, NoteUi.busy(note, consent = true, killCloud = false, status = DeviceModelStatus.AVAILABLE).where)
    }

    @Test fun eachPlaceHasItsLine() {
        assertEquals("Reading on this phone.", Copy.reading(NoteUi.Where.PHONE))
        assertEquals("Reading in the cloud.", Copy.reading(NoteUi.Where.CLOUD))
        assertEquals("Reading the note.", Copy.reading(NoteUi.Where.EITHER))
    }
}
