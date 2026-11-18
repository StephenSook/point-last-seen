package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.LocalDate

class ProfilePublisherTest {
    private class FakeSink : ProfileSink {
        val writes = mutableListOf<Triple<String, String, Map<String, Any?>>>()
        override fun write(incidentId: String, docId: String, data: Map<String, Any?>, onResult: (Throwable?) -> Unit) {
            writes += Triple(incidentId, docId, data)
            onResult(null)
        }
    }

    private val p = SubjectProfile(
        answersTo = "Mae", birthdate = LocalDate.of(1944, 3, 2), medications = "donepezil",
        specialConcern = "falls", placesFrequented = listOf(PlaceEntry("Grace Church", null)),
    )

    @Test fun sharedAndCommandFieldsGoToTheirOwnDocuments() {
        val sink = FakeSink()
        ProfilePublisher(sink).publish("inc-1", p) {}
        assertEquals(listOf("shared", "command"), sink.writes.map { it.second })
        assertEquals(Profiles.forSearchers(p).toMap(), sink.writes[0].third)
        assertEquals(Profiles.forCommand(p).toMap(), sink.writes[1].third)
        assertEquals(setOf("inc-1"), sink.writes.map { it.first }.toSet())
    }

    @Test fun nothingFamilyOnlyIsWritten() {
        val sink = FakeSink()
        ProfilePublisher(sink).publish("inc-1", p) {}
        val all = sink.writes.joinToString { it.third.toString() }
        for (v in listOf("donepezil", "falls", "1944")) assertFalse(v, all.contains(v))
    }

    @Test fun theCallbackReportsBothWrites() {
        var done: Boolean? = null
        ProfilePublisher(FakeSink()).publish("inc-1", p) { ok -> done = ok }
        assertEquals(true, done)
    }
}
