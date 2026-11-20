package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    /** Leaving removes the search and the given keys (the gone flag) in one storage write: a process death cannot keep half. */
    @Test fun leavingRemovesTheSearchAndTheGivenKeysInOneWrite() {
        val writes = mutableListOf<List<String>>()
        val store = object : KeyValueStore {
            val m = mutableMapOf("incidentId" to "inc-1", "gone" to "1", "seq" to "5")
            override fun get(key: String) = m[key]
            override fun put(key: String, value: String) { m[key] = value }
            override fun remove(key: String) { writes += listOf(key); m.remove(key) }
            override fun removeAll(keys: Collection<String>) { writes += keys.toList(); keys.forEach { m.remove(it) } }
        }
        Session(store).leave(alsoRemove = listOf("gone"))
        assertEquals(listOf(listOf("incidentId", "gone")), writes)
        assertEquals(mapOf("seq" to "5"), store.m)
    }

    @Test fun seqStartsFromTheClockOnAFreshInstall() {
        val s = Session(MemoryStore())
        assertEquals(1_763_000_000_000L, s.nextSeq(nowMs = 1_763_000_000_000L))
        assertEquals(1_763_000_000_001L, s.nextSeq(nowMs = 5L))
    }

    @Test fun seqIsPersistedBeforeItIsUsedAndNeverRepeats() {
        val store = MemoryStore()
        val s = Session(store)
        assertEquals(100L, s.nextSeq(100L))
        assertEquals(101L, s.nextSeq(100L))
        assertEquals(102L, Session(store).nextSeq(100L))
    }

    @Test fun theDeviceIdOfAnEventIsTheAuthUid() {
        val ctx = Session(MemoryStore()).context(incidentId = "inc-1", uid = "uid-7", priorVersion = 2, nowMs = 1_000L)
        assertEquals("uid-7", ctx.deviceId)
        assertEquals("uid-7", ctx.authorUid)
        val e = Events.familySighting(FamilySightingInput(900L, null, "x", "n", "blue", "black", "", "", ""), ctx)
        assertEquals(EventIds.eventId("inc-1", "uid-7", 1_000L), e.eventId)
    }

    @Test fun joiningRecordsTheIncidentAndLeavingClearsIt() {
        val store = MemoryStore()
        val s = Session(store)
        assertNull(s.incidentId())
        s.joined("inc-9")
        assertEquals("inc-9", Session(store).incidentId())
        s.leave()
        assertNull(s.incidentId())
    }
}
