package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class ProfileStoreTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    private val full = SubjectProfile(
        answersTo = "Mae", otherNames = listOf("Mama Mae", "Margaret"), birthdate = LocalDate.of(1944, 3, 2), ageYears = 82,
        gender = "female", appearance = "grey curls, \"quoted\"", heightFt = 5, heightIn = 2, weightLb = 130,
        hair = "grey", eyeColor = "brown", primaryLanguage = "English", clothingLastWorn = "blue coat",
        mobilityAids = setOf("cane", "walker"), dementiaType = "lewy_body", shareDementiaType = true,
        flags = setOf("mayNotRespond", "likelyToHide"), triggersToAvoid = "loud voices", bestApproach = "Sing.",
        uniqueDescription = "hums", photoTakenOn = LocalDate.of(2026, 11, 1), profileUpdatedOn = LocalDate.of(2026, 11, 10),
        medications = "donepezil", howMedicationAffectsActions = "sleepy", specialConcern = "falls",
        previousAddresses = listOf(PlaceEntry("12 Oak St", LatLon(33.7, -84.4))),
        placesFrequented = listOf(PlaceEntry("Grace Church", null)),
        pastWandering = listOf(WanderingEntry("the old mill", LatLon(33.1, -84.2))),
        nearbyWater = "creek", vehicle = Vehicle(involved = true, description = "blue sedan"),
        trackingAids = TrackingAids(listOf("project_lifesaver", "gps_tracker"), "County gave her a wrist unit"),
    )

    @Test fun everyFieldSurvivesARoundTrip() {
        assertEquals(full, ProfileCodec.decode(ProfileCodec.encode(full)))
        assertEquals(SubjectProfile(), ProfileCodec.decode(ProfileCodec.encode(SubjectProfile())))
    }

    /** Unanswered stays unanswered (null), and "none" (an empty answer) survives as an answer. */
    @Test fun trackingAidsKeepUnansweredApartFromNone() {
        assertNull(ProfileCodec.decode("""{"answersTo":"Mae"}""").trackingAids)
        val none = SubjectProfile(trackingAids = TrackingAids(emptyList(), ""))
        assertEquals(none, ProfileCodec.decode(ProfileCodec.encode(none)))
    }

    @Test fun theStoreKeepsTheProfileOnThePhone() {
        val kv = MemoryStore()
        ProfileStore(kv).save(full)
        assertEquals(full, ProfileStore(kv).load())
    }

    /** A profile written in parts (an old nickname alone) reads with every list empty and the default flags. */
    @Test fun aNicknameOnlyDocumentReadsWithEmptyListsAndDefaultFlags() {
        val p = ProfileCodec.decode("""{"nickname":"Mama Mae"}""")
        assertEquals(listOf("Mama Mae"), p.otherNames)
        assertEquals(emptySet<String>(), p.mobilityAids)
        assertEquals(SubjectProfile().flags, p.flags)
        assertEquals(emptyList<PlaceEntry>(), p.previousAddresses)
        assertEquals(emptyList<PlaceEntry>(), p.placesFrequented)
        assertEquals(emptyList<WanderingEntry>(), p.pastWandering)
        assertEquals(null, p.vehicle)
        assertEquals(Profiles.approachNoteIds(SubjectProfile(otherNames = listOf("Mama Mae"))), Profiles.approachNoteIds(p))
        assertEquals(18, Profiles.forSearchers(p).flags.size)
    }

    /** A profile saved before the list existed keeps its one nickname as the first other name. */
    @Test fun anOldSavedNicknameBecomesTheFirstOtherName() {
        assertEquals(listOf("Peggy"), ProfileCodec.decode("""{"answersTo":"Mae","nickname":"Peggy"}""").otherNames)
        assertEquals(emptyList<String>(), ProfileCodec.decode("""{"answersTo":"Mae","nickname":"  "}""").otherNames)
        assertEquals(listOf("Margaret"), ProfileCodec.decode("""{"otherNames":["Margaret"],"nickname":"Peggy"}""").otherNames)
        val saved = kotlinx.serialization.json.Json.parseToJsonElement(ProfileCodec.encode(full)) as kotlinx.serialization.json.JsonObject
        assertEquals(false, "nickname" in saved)
    }

    @Test fun aMissingOrBrokenStoredProfileLoadsEmpty() {
        assertEquals(SubjectProfile(), ProfileStore(MemoryStore()).load())
        val kv = MemoryStore().apply { put("profile", "{not json") }
        assertEquals(SubjectProfile(), ProfileStore(kv).load())
    }

    /** A save reports whether it reached the disk, so the edit marks are recorded only after one that did. */
    @Test fun aSaveSaysWhetherItReachedTheDisk() {
        val failing = object : KeyValueStore {
            override fun get(key: String): String? = null
            override fun put(key: String, value: String) {}
            override fun remove(key: String) {}
            override fun putChecked(key: String, value: String): Boolean = false
        }
        assertEquals(false, ProfileStore(failing).save(full))
        assertEquals(true, ProfileStore(MemoryStore()).save(full))
    }
}
