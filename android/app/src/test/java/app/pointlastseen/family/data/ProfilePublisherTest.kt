package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.LocalDate

class ProfilePublisherTest {
    private class FakeSink(var fail: Boolean = false) : ProfileSink {
        val writes = mutableListOf<Triple<String, String, ProfileWrite>>()
        override fun write(incidentId: String, docId: String, change: ProfileWrite, onResult: (Throwable?) -> Unit) {
            writes += Triple(incidentId, docId, change)
            onResult(if (fail) RuntimeException("offline") else null)
        }
    }

    private class MemoryPublished : PublishedProfiles {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, json: String) { m[key] = json }
    }

    private val p = SubjectProfile(
        answersTo = "Mae", birthdate = LocalDate.of(1944, 3, 2), medications = "donepezil",
        specialConcern = "falls", placesFrequented = listOf(PlaceEntry("Grace Church", null)),
    )

    private fun data(w: ProfileWrite) = when (w) { is ProfileWrite.Whole -> w.data; is ProfileWrite.Fields -> w.data }

    @Test fun theFirstPublishWritesBothWholeDocuments() {
        val sink = FakeSink()
        ProfilePublisher(sink, MemoryPublished()).publish("inc-1", p) {}
        assertEquals(listOf("shared", "command"), sink.writes.map { it.second })
        assertEquals(ProfileWrite.Whole(Profiles.forSearchers(p).toMap()), sink.writes[0].third)
        assertEquals(ProfileWrite.Whole(Profiles.forCommand(p).toMap()), sink.writes[1].third)
        assertEquals(setOf("inc-1"), sink.writes.map { it.first }.toSet())
    }

    /** At a restart nothing has changed on the phone, so nothing is written: command's edits stay. */
    @Test fun publishingAnUnchangedProfileAgainWritesNothing() {
        val sink = FakeSink()
        val published = MemoryPublished()
        ProfilePublisher(sink, published).publish("inc-1", p) {}
        sink.writes.clear()
        var done: Boolean? = null
        ProfilePublisher(sink, published).publish("inc-1", p) { done = it }
        assertEquals(emptyList<Triple<String, String, ProfileWrite>>(), sink.writes)
        assertEquals(true, done)
    }

    /** A family edit sends only the fields that changed, so a field command edited is not undone. */
    @Test fun anEditSendsOnlyTheChangedFields() {
        val sink = FakeSink()
        val published = MemoryPublished()
        ProfilePublisher(sink, published).publish("inc-1", p) {}
        sink.writes.clear()
        ProfilePublisher(sink, published).publish("inc-1", p.copy(clothingLastWorn = "blue coat")) {}
        assertEquals(listOf("shared"), sink.writes.map { it.second })
        assertEquals(ProfileWrite.Fields(mapOf("clothingLastWorn" to "blue coat")), sink.writes.single().third)
    }

    /** A write that failed is not remembered as published, so the next publish sends it again. */
    @Test fun aFailedWriteIsSentAgainNextTime() {
        val sink = FakeSink(fail = true)
        val published = MemoryPublished()
        var done: Boolean? = null
        ProfilePublisher(sink, published).publish("inc-1", p) { done = it }
        assertEquals(false, done)
        sink.fail = false
        sink.writes.clear()
        ProfilePublisher(sink, published).publish("inc-1", p) {}
        assertEquals(listOf("shared", "command"), sink.writes.map { it.second })
        assertEquals(true, sink.writes.all { it.third is ProfileWrite.Whole })
    }

    @Test fun nothingFamilyOnlyIsWritten() {
        val sink = FakeSink()
        ProfilePublisher(sink, MemoryPublished()).publish("inc-1", p) {}
        val all = sink.writes.joinToString { data(it.third).toString() }
        for (v in listOf("donepezil", "falls", "1944")) assertFalse(v, all.contains(v))
    }

    /** Every publish that writes the shared document still carries every other name with the nickname. */
    @Test fun anUnrelatedEditStillPublishesEveryOtherName() {
        val sink = FakeSink()
        val named = p.copy(otherNames = listOf("Mama Mae", "Margaret"))
        ProfilePublisher(sink, MemoryPublished()).publish("inc-1", named.copy(clothingLastWorn = "blue coat")) {}
        val shared = data(sink.writes.single { it.second == "shared" }.third)
        assertEquals(listOf("Mama Mae", "Margaret"), shared["otherNames"])
        assertEquals("Mama Mae", shared["nickname"])
        assertEquals("blue coat", shared["clothingLastWorn"])
    }

    @Test fun theCallbackReportsBothWrites() {
        var done: Boolean? = null
        ProfilePublisher(FakeSink(), MemoryPublished()).publish("inc-1", p) { ok -> done = ok }
        assertEquals(true, done)
    }

    /** No document yet: the first publish creates it whole. */
    @Test fun aFirstPublishCreatesAMissingDocument() {
        val mine = mapOf("answersTo" to "Mae", "clothingLastWorn" to "blue coat")
        assertEquals(FirstPublish.Create(mine), FirstPublish.of(existing = null, mine = mine))
    }

    /**
     * A document already there (a reinstall, a second family phone): a command edit, another phone's tracking
     * answer and a field this app does not know all stay; only keys the server lacks or holds as null are added.
     */
    @Test fun aFirstPublishKeepsWhatIsAlreadyThere() {
        val existing = mapOf<String, Any?>(
            "answersTo" to "Mae (edited by command)", "ageYears" to null,
            "trackingAids" to mapOf("aids" to listOf("medicalert_id"), "note" to ""), "aFieldFromANewerSchema" to "kept",
        )
        val mine = mapOf<String, Any?>("answersTo" to "Mae", "ageYears" to 82, "clothingLastWorn" to "blue coat")
        assertEquals(FirstPublish.AddMissing(mapOf("ageYears" to 82, "clothingLastWorn" to "blue coat")), FirstPublish.of(existing, mine))
    }

    @Test fun aFirstPublishOverACompleteDocumentWritesNothing() {
        val existing = mapOf<String, Any?>("answersTo" to "Mae (edited by command)", "clothingLastWorn" to "red coat")
        assertEquals(FirstPublish.Nothing, FirstPublish.of(existing, mapOf("answersTo" to "Mae", "clothingLastWorn" to "blue coat")))
    }
}
