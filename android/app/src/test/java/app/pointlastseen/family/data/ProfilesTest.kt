package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class ProfilesTest {
    private val zone = ZoneId.of("America/New_York")
    private val today = LocalDate.of(2026, 11, 17)
    private fun daysAgo(n: Long) = today.minusDays(n)

    private val full = SubjectProfile(
        answersTo = "Mae", nickname = "Mama Mae", birthdate = LocalDate.of(1944, 3, 2), ageYears = 82,
        gender = "female", appearance = "short, grey curls", heightFt = 5, heightIn = 2, weightLb = 130,
        hair = "grey", eyeColor = "brown", primaryLanguage = "English", clothingLastWorn = "blue coat",
        mobilityAids = "cane", dementiaType = "lewy_body", shareDementiaType = true,
        flags = setOf("mayNotRespond", "likelyToHide"),
        triggersToAvoid = "loud voices", bestApproach = "Sing with her.", uniqueDescription = "hums",
        photoTakenOn = daysAgo(10), profileUpdatedOn = daysAgo(10),
        medications = "donepezil", howMedicationAffectsActions = "sleepy at noon", specialConcern = "falls",
        previousAddresses = listOf(Place("12 Oak St"), Place("4 Pine Rd")),
        placesFrequented = listOf(Place("Grace Church")), pastWandering = listOf("the old mill"),
        nearbyWater = "creek behind the house", vehicle = "",
    )

    @Test fun sharedAndCommandProfilesShareNoKey() {
        val a = Profiles.forSearchers(full).keys
        val b = Profiles.forCommand(full).keys
        assertTrue(a.intersect(b).isEmpty())
    }

    @Test fun familyOnlyFieldsNeverLeaveThePhone() {
        val both = (Profiles.forSearchers(full) + Profiles.forCommand(full)).toString()
        for (k in listOf("medications", "howMedicationAffectsActions", "birthdate", "specialConcern", "profileUpdatedOn", "shareDementiaType")) {
            assertFalse(k, both.contains(k))
        }
        for (v in listOf("donepezil", "sleepy at noon", "1944")) assertFalse(v, both.contains(v))
    }

    @Test fun historyGoesOnlyToTheCommandDocument() {
        val shared = Profiles.forSearchers(full).toString()
        assertFalse(shared.contains("12 Oak St"))
        assertFalse(shared.contains("the old mill"))
        assertFalse(shared.contains("creek behind the house"))
        val command = Profiles.forCommand(full)
        assertEquals(setOf("previousAddresses", "placesFrequented", "pastWandering", "nearbyWater", "vehicle"), command.keys)
        assertEquals(listOf(mapOf("foundWhere" to "the old mill")), command["pastWandering"])
    }

    @Test fun dementiaTypeIsSharedOnlyWithTheConsentSwitch() {
        assertEquals("lewy_body", Profiles.forSearchers(full)["dementiaType"])
        assertNull(Profiles.forSearchers(full.copy(shareDementiaType = false))["dementiaType"])
        assertFalse(Profiles.forSearchers(full.copy(shareDementiaType = false)).containsKey("dementiaType"))
    }

    @Test fun mayNotRespondDefaultsOn() {
        assertTrue(SubjectProfile().flags.contains("mayNotRespond"))
    }

    @Test fun warnsAfter60And183Days() {
        val now = today.atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(listOf("photo_old"), Profiles.warnings(full.copy(photoTakenOn = daysAgo(61), profileUpdatedOn = daysAgo(10)), now, zone).filter { it != "clock_changed" })
        assertEquals(listOf("profile_stale"), Profiles.warnings(full.copy(photoTakenOn = daysAgo(5), profileUpdatedOn = daysAgo(184)), now, zone).filter { it != "clock_changed" })
        assertEquals(emptyList<String>(), Profiles.warnings(full.copy(photoTakenOn = daysAgo(60), profileUpdatedOn = daysAgo(5)), now, zone))
    }

    @Test fun promptsAtEachClockChange() {
        val now = today.atStartOfDay(zone).toInstant().toEpochMilli()
        // US clocks changed on 2026-11-01; an update on 2026-10-20 predates it.
        assertTrue(Profiles.warnings(full.copy(profileUpdatedOn = LocalDate.of(2026, 10, 20)), now, zone).contains("clock_changed"))
        assertFalse(Profiles.warnings(full.copy(profileUpdatedOn = LocalDate.of(2026, 11, 2)), now, zone).contains("clock_changed"))
    }

    @Test fun aProfileNeverUpdatedIsStale() {
        val now = today.atStartOfDay(zone).toInstant().toEpochMilli()
        assertTrue(Profiles.warnings(SubjectProfile(), now, zone).contains("profile_stale"))
    }

    @Test fun freeTextIsCappedAt200Characters() {
        val long = "x".repeat(250)
        val shared = Profiles.forSearchers(full.copy(bestApproach = long))
        assertEquals(200, (shared["bestApproach"] as String).length)
    }
}
