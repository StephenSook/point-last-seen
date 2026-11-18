package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
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
        answersTo = "Mae", nickname = "Mama Mae", birthdate = LocalDate.of(1944, 3, 2), ageYears = 82,
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
    )

    @Test fun everyFieldSurvivesARoundTrip() {
        assertEquals(full, ProfileCodec.decode(ProfileCodec.encode(full)))
        assertEquals(SubjectProfile(), ProfileCodec.decode(ProfileCodec.encode(SubjectProfile())))
    }

    @Test fun theStoreKeepsTheProfileOnThePhone() {
        val kv = MemoryStore()
        ProfileStore(kv).save(full)
        assertEquals(full, ProfileStore(kv).load())
    }

    @Test fun aMissingOrBrokenStoredProfileLoadsEmpty() {
        assertEquals(SubjectProfile(), ProfileStore(MemoryStore()).load())
        val kv = MemoryStore().apply { put("profile", "{not json") }
        assertEquals(SubjectProfile(), ProfileStore(kv).load())
    }
}
