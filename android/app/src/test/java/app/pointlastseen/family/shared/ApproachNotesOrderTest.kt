package app.pointlastseen.family.shared

import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.SubjectProfile
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Android's approach note ids follow shared/constants/approach-notes.json. */
class ApproachNotesOrderTest {
    private val file = SharedFiles.json("shared/constants/approach-notes.json")
    private val order = file["order"]!!.jsonArray.map { it.jsonPrimitive.content }

    @Test fun aProfileThatShowsEveryNoteListsThemInTheSharedOrder() {
        val everything = SubjectProfile(
            flags = Profiles.FLAGS.toSet(), dementiaType = "lewy_body", shareDementiaType = true,
            primaryLanguage = "Spanish", triggersToAvoid = "loud voices", bestApproach = "Sing.", uniqueDescription = "hums",
        )
        assertEquals(21, order.size)
        assertEquals(order, Profiles.approachNoteIds(everything))
    }

    @Test fun everyIdAndroidCanWriteHasSharedCopy() {
        val notes = file["notes"]!!.jsonObject.keys
        val everything = SubjectProfile(flags = Profiles.FLAGS.toSet(), primaryLanguage = "x", triggersToAvoid = "x", bestApproach = "x", uniqueDescription = "x")
        assertTrue(notes.containsAll(Profiles.approachNoteIds(everything)))
    }
}
