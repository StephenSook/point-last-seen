package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyEditsTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    private val before = SubjectProfile(answersTo = "Mae", hair = "white")

    /** A save marks exactly the published fields it changed, per document. */
    @Test fun aSaveMarksOnlyTheFieldsItChanged() {
        val edits = FamilyEdits(MemoryStore())
        edits.record(before, before.copy(clothingLastWorn = "blue coat"))
        assertEquals(setOf("clothingLastWorn"), edits.keys("shared"))
        assertFalse("answersTo" in edits.keys("command"))
    }

    @Test fun aSaveThatChangesNothingMarksNothing() {
        val edits = FamilyEdits(MemoryStore())
        edits.record(before, before)
        assertEquals(emptySet<String>(), edits.keys("shared"))
        assertEquals(emptySet<String>(), edits.keys("command"))
    }

    /** Edits add up across saves and are kept on the phone across a restart. */
    @Test fun editsAddUpAndSurviveARestart() {
        val store = MemoryStore()
        FamilyEdits(store).record(before, before.copy(clothingLastWorn = "blue coat"))
        FamilyEdits(store).record(before, before.copy(hair = "grey"))
        val keys = FamilyEdits(store).keys("shared")
        assertTrue("clothingLastWorn" in keys && "hair" in keys)
    }
}
