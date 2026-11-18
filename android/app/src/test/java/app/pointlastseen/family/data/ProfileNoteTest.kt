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

    @Test fun theSamePlaceIsNotAddedTwice() {
        val once = Profiles.applyNote(SubjectProfile(), r("place", "the old mill"))
        assertEquals(1, Profiles.applyNote(once, r("place", "The Old Mill ")).placesFrequented.size)
    }
}
