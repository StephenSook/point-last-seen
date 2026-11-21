package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IncidentInfoTest {
    @Test fun aDrillIncidentReadsItsModeStatusAndPrior() {
        val i = IncidentInfo.from(mapOf("mode" to "drill", "status" to "open", "drillLabel" to "Drill 1", "priorVersion" to 3L, "name" to "Mill drill"))!!
        assertEquals("drill", i.mode)
        assertEquals("open", i.status)
        assertEquals(3L, i.priorVersion)
        assertEquals("Drill 1", i.drillLabel)
    }

    @Test fun unknownValuesFallBackSafely() {
        val i = IncidentInfo.from(mapOf("mode" to "party", "status" to "weird"))!!
        assertNull(i.mode)
        assertEquals("open", i.status)
        assertEquals(1L, i.priorVersion)
    }

    /** Command ends a search by closing it with a reason (found, suspended or training ended); any other value is none. */
    @Test fun aClosedSearchReadsItsReason() {
        assertEquals("found", IncidentInfo.from(mapOf("status" to "closed", "closedReason" to "found"))!!.closedReason)
        assertEquals("training_ended", IncidentInfo.from(mapOf("status" to "closed", "closedReason" to "training_ended"))!!.closedReason)
        assertNull(IncidentInfo.from(mapOf("status" to "closed", "closedReason" to "rescued"))!!.closedReason)
        assertNull(IncidentInfo.from(mapOf("status" to "closed"))!!.closedReason)
        assertNull(IncidentInfo.from(mapOf("status" to "open", "closedReason" to "found"))!!.closedReason)
    }

    @Test fun noDocumentGivesNoIncident() {
        assertNull(IncidentInfo.from(null))
    }
}
