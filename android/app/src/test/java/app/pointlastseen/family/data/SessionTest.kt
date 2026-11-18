package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    @Test fun theDeviceIdIsMadeOnceAndKept() {
        val store = MemoryStore()
        val a = Session(store).deviceId()
        val b = Session(store).deviceId()
        assertEquals(a, b)
        assertEquals(36, a.length)
        assertNotEquals(a, Session(MemoryStore()).deviceId())
    }

    @Test fun seqIsPersistedBeforeItIsUsedAndNeverRepeats() {
        val store = MemoryStore()
        val s = Session(store)
        assertEquals(1L, s.nextSeq())
        assertEquals(2L, s.nextSeq())
        assertEquals(3L, Session(store).nextSeq())
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
