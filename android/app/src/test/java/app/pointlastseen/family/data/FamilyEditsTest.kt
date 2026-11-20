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

    /**
     * A collection edit (flags, lists, aids) is marked, so the approach notes it drives follow it at a first publish;
     * it is still never sendable over command's value (sent whole it would replace entries command added, such as a
     * fall-risk flag), so collections stay add-only-if-missing.
     */
    @Test fun aCheckboxOrListEditIsMarkedButNeverSentOverCommand() {
        val edits = FamilyEdits(MemoryStore())
        edits.record(before, before.copy(flags = before.flags + "likelyToHide", mobilityAids = setOf("cane")))
        edits.record(before, before.copy(placesFrequented = listOf(PlaceEntry("Grace Church", null))))
        assertTrue("flags" in edits.keys("shared"))
        assertTrue("placesFrequented" in edits.keys("command"))
        assertFalse(EditableFields.sendable("flags", mapOf("likelyToHide" to true), mapOf("fallRisk" to true)))
    }

    /** A flag ticked before the first publish brings its note when the stored document has no flags yet. */
    @Test fun aFlagTickedBeforeTheFirstPublishBringsItsNote() {
        val edits = FamilyEdits(MemoryStore())
        val after = before.copy(flags = before.flags + "seizures")
        edits.record(before, after)
        val existing = mapOf<String, Any?>("answersTo" to "Mae", "approachNoteIds" to listOf("approach_calm"))
        val out = FirstPublish.of(existing, Profiles.forSearchers(after).toMap(), edits.keys("shared"))
        assertTrue(out.toString(), out is FirstPublish.Merge && "seizures" in (out.data["approachNoteIds"] as List<*>))
    }

    /** A derived field follows its source: a new other name changes the nickname, but the nickname is not marked. */
    @Test fun aDerivedFieldIsNeverMarked() {
        val edits = FamilyEdits(MemoryStore())
        edits.record(before, before.copy(otherNames = listOf("Mom"), flags = before.flags + "seizures"))
        assertFalse("nickname" in edits.keys("shared"))
        assertFalse("approachNoteIds" in edits.keys("shared"))
    }

    /** Leaving or a drop ends the edits' reach: they never apply to the next search's first publish. */
    @Test fun clearingForgetsEveryEdit() {
        val store = MemoryStore()
        FamilyEdits(store).record(before, before.copy(clothingLastWorn = "blue coat"))
        FamilyEdits(store).clear()
        assertEquals(emptySet<String>(), FamilyEdits(store).keys("shared"))
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

    /** Leaving forgets the search and the edit marks in one write, so a failed or interrupted write cannot keep half. */
    @Test fun leavingForgetsTheMarksInTheSameWriteAsTheSearch() {
        val writes = mutableListOf<List<String>>()
        val store = object : KeyValueStore {
            val m = mutableMapOf("incidentId" to "inc-1")
            override fun get(key: String) = m[key]
            override fun put(key: String, value: String) { m[key] = value }
            override fun remove(key: String) { writes += listOf(key); m.remove(key) }
            override fun removeAll(keys: Collection<String>) { writes += keys.toList(); keys.forEach { m.remove(it) } }
        }
        FamilyEdits(store).record(before, before.copy(clothingLastWorn = "blue coat"))
        Session(store).leave(alsoRemove = FamilyEdits.STORED_KEYS)
        assertEquals(1, writes.size)
        assertEquals(emptySet<String>(), FamilyEdits(store).keys("shared"))
        assertEquals(null, store.get("incidentId"))
    }
}
