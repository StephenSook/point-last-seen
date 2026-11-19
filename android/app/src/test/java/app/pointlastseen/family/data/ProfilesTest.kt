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
    private val now = today.atStartOfDay(zone).toInstant().toEpochMilli()

    private val full = SubjectProfile(
        answersTo = "Mae", otherNames = listOf("Mama Mae", "Margaret"), birthdate = LocalDate.of(1944, 3, 2), ageYears = 82,
        gender = "female", appearance = "short, grey curls", heightFt = 5, heightIn = 2, weightLb = 130,
        hair = "grey", eyeColor = "brown", primaryLanguage = "English", clothingLastWorn = "blue coat",
        mobilityAids = setOf("cane"), dementiaType = "lewy_body", shareDementiaType = true,
        flags = setOf("mayNotRespond", "likelyToHide"),
        triggersToAvoid = "loud voices", bestApproach = "Sing with her.", uniqueDescription = "hums",
        photoTakenOn = daysAgo(10), profileUpdatedOn = daysAgo(10),
        medications = "donepezil", howMedicationAffectsActions = "sleepy at noon", specialConcern = "falls",
        previousAddresses = listOf(PlaceEntry("12 Oak St", LatLon(33.7, -84.4)), PlaceEntry("4 Pine Rd", null)),
        placesFrequented = listOf(PlaceEntry("Grace Church", null)),
        pastWandering = listOf(WanderingEntry("the old mill", null)),
        nearbyWater = "creek behind the house", vehicle = null,
    )

    /** Up to five other names, each trimmed and at most 60 characters, with blanks and repeats dropped. */
    @Test fun otherNamesAreTrimmedDedupedAndCappedAtFive() {
        val typed = listOf(" Peggy ", "", "peggy", "Margaret", "a".repeat(70), "B", "C", "D", "E")
        assertEquals(listOf("Peggy", "Margaret", "a".repeat(60), "B", "C"), Profiles.otherNames(typed))
    }

    /** The shared packet carries every other name, and its nickname field (kept for older readers) the first. */
    @Test fun theSharedPacketCarriesEveryOtherName() {
        val shared = Profiles.forSearchers(full)
        assertEquals(listOf("Mama Mae", "Margaret"), shared.otherNames)
        assertEquals(listOf("Mama Mae", "Margaret"), shared.toMap()["otherNames"])
        val none = Profiles.forSearchers(full.copy(otherNames = listOf(" ", "")))
        assertEquals(emptyList<String>(), none.toMap()["otherNames"])
        assertEquals("", none.nickname)
    }

    /** The shared packet still has one nickname field: it carries the first other name. */
    @Test fun theSharedNicknameIsTheFirstOtherName() {
        assertEquals("Mama Mae", Profiles.forSearchers(full).nickname)
        assertEquals("", Profiles.forSearchers(full.copy(otherNames = emptyList())).nickname)
        assertEquals("Peggy", Profiles.forSearchers(full.copy(otherNames = listOf("  ", " Peggy "))).nickname)
    }

    @Test fun sharedAndCommandProfilesShareNoKey() {
        val a = Profiles.forSearchers(full).toMap().keys
        val b = Profiles.forCommand(full).toMap().keys
        assertTrue(a.intersect(b).isEmpty())
    }

    @Test fun familyOnlyFieldsNeverLeaveThePhone() {
        val both = (Profiles.forSearchers(full).toMap() + Profiles.forCommand(full).toMap()).toString()
        for (k in listOf("medications", "howMedicationAffectsActions", "birthdate", "specialConcern", "profileUpdatedOn", "shareDementiaType")) {
            assertFalse(k, both.contains(k))
        }
        for (v in listOf("donepezil", "sleepy at noon", "1944")) assertFalse(v, both.contains(v))
    }

    @Test fun historyGoesOnlyToTheCommandDocument() {
        val shared = Profiles.forSearchers(full).toMap().toString()
        for (v in listOf("12 Oak St", "the old mill", "creek behind the house", "Grace Church")) assertFalse(v, shared.contains(v))
        val command = Profiles.forCommand(full).toMap()
        assertEquals(listOf(mapOf("foundWhere" to "the old mill", "position" to null)), command["pastWandering"])
        assertEquals(mapOf("label" to "12 Oak St", "position" to mapOf("lat" to 33.7, "lon" to -84.4)), (command["previousAddresses"] as List<*>)[0])
    }

    @Test fun dementiaTypeIsSharedOnlyWithTheConsentSwitch() {
        assertEquals("lewy_body", Profiles.forSearchers(full).dementiaType)
        val off = Profiles.forSearchers(full.copy(shareDementiaType = false))
        assertNull(off.dementiaType)
        assertTrue(off.toMap().containsKey("dementiaType"))
    }

    @Test fun numbersOutsideTheSchemaRangeAreLeftBlank() {
        val p = Profiles.forSearchers(full.copy(ageYears = 12, heightFt = 9, heightIn = 12, weightLb = 20))
        assertNull(p.ageYears)
        assertNull(p.heightFt)
        assertNull(p.heightIn)
        assertNull(p.weightLb)
    }

    @Test fun everyFlagIsWrittenAsABoolean() {
        val flags = Profiles.forSearchers(full).flags
        assertEquals(Profiles.FLAGS.toSet(), flags.keys)
        assertTrue(flags.getValue("likelyToHide"))
        assertFalse(flags.getValue("seizures"))
    }

    @Test fun mayNotRespondDefaultsOn() {
        assertTrue(SubjectProfile().flags.contains("mayNotRespond"))
    }

    @Test fun defaultProfileShowsMayNotRespondAndApproachCalmFirst() {
        assertEquals(listOf("may_not_respond", "approach_calm", "stop_calling_name"), Profiles.approachNoteIds(SubjectProfile()))
    }

    @Test fun mayNotRespondAndApproachCalmComeFirstThenTheTableOrder() {
        assertEquals(
            listOf("may_not_respond", "approach_calm", "stop_calling_name", "likely_to_hide", "validate_feelings", "language", "triggers", "best_approach", "unique"),
            Profiles.approachNoteIds(full),
        )
    }

    /** "Stop calling their name" shows exactly when "may not respond" does. */
    @Test fun stopCallingNameShowsOnlyWithMayNotRespond() {
        assertFalse("stop_calling_name" in Profiles.approachNoteIds(SubjectProfile(flags = emptySet())))
        assertTrue("stop_calling_name" in Profiles.approachNoteIds(SubjectProfile(flags = setOf("mayNotRespond"))))
    }

    @Test fun flagsAndTextAddTheirNotes() {
        val ids = Profiles.approachNoteIds(full.copy(flags = setOf("mayNotRespond", "likelyToHide", "afraidOfUniforms", "slowToRespond", "likelyToFight", "carriesMedicalAlertCard")))
        for (id in listOf("likely_to_hide", "afraid_of_uniforms", "soft_voice", "may_strike_out", "medication_alert", "language", "triggers", "best_approach", "unique")) {
            assertTrue(id, ids.contains(id))
        }
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test fun lewyBodyAddsValidateFeelingsOnlyWhenTheTypeIsShared() {
        assertTrue(Profiles.approachNoteIds(full).contains("validate_feelings"))
        assertFalse(Profiles.approachNoteIds(full.copy(shareDementiaType = false)).contains("validate_feelings"))
        assertTrue(Profiles.approachNoteIds(full.copy(shareDementiaType = false, flags = setOf("hallucinationsOrDelusions"))).contains("validate_feelings"))
    }

    @Test fun theSharedDocumentCarriesTheNoteIds() {
        assertEquals(Profiles.approachNoteIds(full), Profiles.forSearchers(full).approachNoteIds)
    }

    @Test fun warnsAfter60And183Days() {
        assertEquals(listOf("photo_old"), Profiles.warnings(full.copy(photoTakenOn = daysAgo(61), profileUpdatedOn = daysAgo(10)), now, zone))
        assertEquals(listOf("profile_stale"), Profiles.warnings(full.copy(photoTakenOn = daysAgo(5), profileUpdatedOn = daysAgo(184)), now, zone).filter { it != "clock_changed" })
        assertEquals(emptyList<String>(), Profiles.warnings(full.copy(photoTakenOn = daysAgo(60), profileUpdatedOn = daysAgo(5)), now, zone))
    }

    @Test fun promptsAtEachClockChange() {
        // US clocks changed on 2026-11-01; an update on 2026-10-20 predates it.
        assertTrue(Profiles.warnings(full.copy(profileUpdatedOn = LocalDate.of(2026, 10, 20)), now, zone).contains("clock_changed"))
        assertFalse(Profiles.warnings(full.copy(profileUpdatedOn = LocalDate.of(2026, 11, 2)), now, zone).contains("clock_changed"))
    }

    @Test fun aProfileNeverSavedHasNoUpdatePrompt() {
        assertEquals(emptyList<String>(), Profiles.warnings(SubjectProfile(), now, zone))
    }

    @Test fun freeTextIsCappedAtTheSchemaLengths() {
        val p = Profiles.forSearchers(full.copy(bestApproach = "x".repeat(250), answersTo = "y".repeat(90)))
        assertEquals(200, p.bestApproach.length)
        assertEquals(60, p.answersTo.length)
        val c = Profiles.forCommand(full.copy(previousAddresses = listOf(PlaceEntry("z".repeat(100), null), PlaceEntry("  ", null))))
        assertEquals(listOf(80), c.previousAddresses.map { it.label.length })
    }

    /** Absent means unknown: a profile the family never answered sends no trackingAids key at all. */
    @Test fun trackingAidsAreLeftOutUntilTheFamilyAnswers() {
        assertFalse("trackingAids" in Profiles.forSearchers(SubjectProfile()).toMap())
    }

    /** An empty answer means the family said none, and it is sent as such. */
    @Test fun anEmptyTrackingAnswerMeansNone() {
        val shared = Profiles.forSearchers(SubjectProfile(trackingAids = TrackingAids(emptyList(), ""))).toMap()
        assertEquals(mapOf("aids" to emptyList<String>(), "note" to ""), shared["trackingAids"])
    }

    /** Only the four known aids, each once, in a fixed order. */
    @Test fun trackingAidsKeepOnlyKnownDistinctValuesInOrder() {
        val t = TrackingAids(listOf("gps_tracker", "bogus", "project_lifesaver", "gps_tracker"), "")
        assertEquals(listOf("project_lifesaver", "gps_tracker"), Profiles.forSearchers(SubjectProfile(trackingAids = t)).trackingAids?.aids)
        assertEquals(listOf("project_lifesaver", "medicalert_id", "gps_tracker", "phone_location"), Profiles.TRACKING_AIDS)
    }

    /** The note is trimmed and capped at 80, and a note with any digit (fullwidth too) is never sent: no phone or device numbers. */
    @Test fun aTrackingNoteIsCappedAndNeverCarriesADigit() {
        fun note(n: String) = Profiles.forSearchers(SubjectProfile(trackingAids = TrackingAids(emptyList(), n))).trackingAids?.note
        assertEquals("County gave her a wrist unit", note("  County gave her a wrist unit  "))
        assertEquals(80, note("x".repeat(100))?.length)
        assertEquals("", note("Unit 4 in his coat"))
        assertEquals("", note("Unit \uFF14 in his coat"))
        assertEquals("", note("Call 404 555 0142"))
    }
}
