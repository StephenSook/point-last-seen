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

    @Test fun noDocumentGivesNoIncident() {
        assertNull(IncidentInfo.from(null))
    }
}
