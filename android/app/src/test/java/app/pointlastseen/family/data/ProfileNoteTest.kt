package app.pointlastseen.family.data

import app.pointlastseen.family.ai.FamilyNoteReading
import org.junit.Assert.assertEquals
import org.junit.Test

class ProfileNoteTest {
    private fun r(kind: String, label: String) = FamilyNoteReading(kind, label, "s", "q")

    @Test fun aPlaceIsAddedToPlacesFrequented() {
        val p = Profiles.applyNote(SubjectProfile(), r("place", "the old mill"))
        assertEquals(listOf(PlaceEntry("the old mill", null)), p.placesFrequented)
    }

    @Test fun anAddressAndAWanderingSpotGoToTheirLists() {
        assertEquals(listOf(PlaceEntry("12 Oak St", null)), Profiles.applyNote(SubjectProfile(), r("address", "12 Oak St")).previousAddresses)
        assertEquals(listOf(WanderingEntry("the bus station", null)), Profiles.applyNote(SubjectProfile(), r("wandering", "the bus station")).pastWandering)
    }

    @Test fun clothingReplacesWhatTheyLastWore() {
        assertEquals("red scarf", Profiles.applyNote(SubjectProfile(clothingLastWorn = "blue coat"), r("clothing", "red scarf")).clothingLastWorn)
    }

    @Test fun aPhoneNumberInTheLabelNeverReachesTheProfile() {
        val placed = Profiles.applyNote(SubjectProfile(), r("place", "Ann at 404-555-0142 says the mill"))
        assertEquals("Ann at [number removed] says the mill", placed.placesFrequented.single().label)
        val worn = Profiles.applyNote(SubjectProfile(), r("clothing", "red scarf, call (404) 5550142"))
        assertEquals("red scarf, call [number removed]", worn.clothingLastWorn)
        val shared = Profiles.forSearchers(worn).toMap().toString() + Profiles.forCommand(placed).toMap().toString()
        assertEquals(false, shared.contains("0142"))
    }

    @Test fun theSamePlaceIsNotAddedTwice() {
        val once = Profiles.applyNote(SubjectProfile(), r("place", "the old mill"))
        assertEquals(1, Profiles.applyNote(once, r("place", "The Old Mill ")).placesFrequented.size)
    }
}
