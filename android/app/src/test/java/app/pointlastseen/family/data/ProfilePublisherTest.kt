package app.pointlastseen.family.data

import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ProfilePublisherTest {
    private class FakeSink(var fail: Boolean = false) : ProfileSink {
        val writes = mutableListOf<Triple<String, String, ProfileWrite>>()
        val joinChecks = mutableListOf<StillJoined>()
        override fun write(incidentId: String, docId: String, change: ProfileWrite, stillJoined: StillJoined, onResult: (Throwable?) -> Unit) {
            writes += Triple(incidentId, docId, change)
            joinChecks += stillJoined
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
     * answer and a field this app does not know all stay; only keys the server lacks are added.
     */
    @Test fun aFirstPublishKeepsWhatIsAlreadyThere() {
        val existing = mapOf<String, Any?>(
            "answersTo" to "Mae (edited by command)",
            "trackingAids" to mapOf("aids" to listOf("medicalert_id"), "note" to ""), "aFieldFromANewerSchema" to "kept",
        )
        val mine = mapOf<String, Any?>("answersTo" to "Mae", "clothingLastWorn" to "blue coat")
        assertEquals(FirstPublish.Merge(mapOf("clothingLastWorn" to "blue coat")), FirstPublish.of(existing, mine))
    }

    /**
     * Safety field: command set the clothing; the family corrected it on this phone before the phone's first
     * publish. The correction is sent; a field the family never touched keeps command's value.
     */
    @Test fun aFieldTheFamilyEditedBeforeTheFirstPublishIsSent() {
        val existing = mapOf<String, Any?>("clothingLastWorn" to "red coat", "hair" to "white")
        val mine = mapOf<String, Any?>("clothingLastWorn" to "blue coat", "hair" to "", "answersTo" to "Mae")
        assertEquals(
            FirstPublish.Merge(mapOf("clothingLastWorn" to "blue coat", "answersTo" to "Mae")),
            FirstPublish.of(existing, mine, edited = setOf("clothingLastWorn")),
        )
    }

    /** The first publish of each document carries the fields the family edited on this phone. */
    @Test fun theFirstPublishCarriesTheFamilysEdits() {
        val sink = FakeSink()
        ProfilePublisher(sink, MemoryPublished(), edited = { doc -> if (doc == "shared") setOf("clothingLastWorn") else emptySet() })
            .publish("inc-1", p) {}
        assertEquals(setOf("clothingLastWorn"), (sink.writes[0].third as ProfileWrite.Whole).edited)
        assertEquals(emptySet<String>(), (sink.writes[1].third as ProfileWrite.Whole).edited)
    }

    /**
     * One write per document at a time: a save while the first publish is in flight waits for it, so an older
     * first publish retried late can never land over the newer value; the newer save then goes as an edit.
     */
    @Test fun aSaveWaitsForTheDocumentsWriteInFlightThenSendsItsChange() {
        val held = mutableListOf<Pair<ProfileWrite, (Throwable?) -> Unit>>()
        val publisher = ProfilePublisher({ _, doc, change, _, onResult -> if (doc == "shared") held += change to onResult else onResult(null) }, MemoryPublished())
        var first: Boolean? = null
        var second: Boolean? = null
        publisher.publish("inc-1", p) { first = it }
        publisher.publish("inc-1", p.copy(clothingLastWorn = "red sweater")) { second = it }
        assertEquals(1, held.size)
        assertTrue(held[0].first is ProfileWrite.Whole)
        held[0].second(null)
        assertEquals(true, first)
        assertEquals(2, held.size)
        assertEquals(ProfileWrite.Fields(mapOf("clothingLastWorn" to "red sweater")), held[1].first)
        held[1].second(null)
        assertEquals(true, second)
    }

    /** A publish for a join the phone has left writes nothing and reports it was not shared. */
    @Test fun aPublishForASearchThePhoneLeftWritesNothing() {
        val sink = FakeSink()
        var done: Boolean? = null
        ProfilePublisher(sink, MemoryPublished()).publish("inc-1", p, { false }) { done = it }
        assertEquals(emptyList<Triple<String, String, ProfileWrite>>(), sink.writes)
        assertEquals(false, done)
    }

    /** The join check reaches the sink, which checks it again where it stages each write. */
    @Test fun theSinkGetsTheJoinCheck() {
        val sink = FakeSink()
        var joined = true
        ProfilePublisher(sink, MemoryPublished()).publish("inc-1", p, { joined }) {}
        joined = false
        assertEquals(2, sink.joinChecks.size)
        assertTrue(sink.joinChecks.none { it.check() })
    }

    /** Inside the first-publish transaction (every attempt): once the phone has left, nothing is staged. */
    @Test fun aFirstPublishStagesNothingOnceThePhoneHasLeft() {
        val mine = mapOf<String, Any?>("answersTo" to "Mae")
        assertEquals(FirstPublish.Create(mine), FirstPublish.staged(null, mine, emptySet()) { true })
        assertThrows(LeftSearchException::class.java) { FirstPublish.staged(null, mine, emptySet()) { false } }
    }

    /** Leaving waits for the profile writes already handed to the sink, not only Firestore's pending writes. */
    @Test fun settleWaitsForProfileWritesInFlight() = runTest {
        val held = mutableListOf<(Throwable?) -> Unit>()
        val publisher = ProfilePublisher({ _, _, _, _, onResult -> held += onResult }, MemoryPublished())
        publisher.publish("inc-1", p) {}
        val settled = async { publisher.settle() }
        runCurrent()
        assertFalse(settled.isCompleted)
        held.forEach { it(null) }
        runCurrent()
        assertTrue(settled.isCompleted)
    }

    /** A field command left empty (null) stays empty: a first publish never fills it; an edit does that explicitly. */
    @Test fun aNullOnTheServerStaysNullAfterAFirstPublish() {
        val existing = mapOf<String, Any?>("answersTo" to "Mae", "ageYears" to null, "photoTakenOn" to null)
        val mine = mapOf<String, Any?>("answersTo" to "Mae", "ageYears" to 82, "photoTakenOn" to "2026-11-01", "clothingLastWorn" to "blue coat")
        assertEquals(FirstPublish.Merge(mapOf("clothingLastWorn" to "blue coat")), FirstPublish.of(existing, mine))
    }

    @Test fun aFirstPublishOverACompleteDocumentWritesNothing() {
        val existing = mapOf<String, Any?>("answersTo" to "Mae (edited by command)", "clothingLastWorn" to "red coat")
        assertEquals(FirstPublish.Nothing, FirstPublish.of(existing, mapOf("answersTo" to "Mae", "clothingLastWorn" to "blue coat")))
    }
}
