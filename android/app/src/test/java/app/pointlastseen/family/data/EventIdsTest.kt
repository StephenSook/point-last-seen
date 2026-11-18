package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class EventIdsTest {
    // Expected values computed independently with Python hashlib over the
    // spec section 8 encoding (4-byte big-endian length, then UTF-8 bytes).
    @Test fun idMatchesTheIndependentReference() {
        assertEquals("db0b8487967fa41245605df4437eb2e2", EventIds.eventId("inc-1", "dev-1", 1))
        assertEquals("428f332b0b84e2fbd9fedf7a13954f46", EventIds.eventId("incident-ä", "device-9", 1234567890123))
    }

    @Test fun fieldsAreLengthPrefixedNotJoined() {
        val a = EventIds.eventId("ab", "c", 1)
        val b = EventIds.eventId("a", "bc", 1)
        assertEquals("1633200e31aaefaf098fbbd2c3fe56a9", a)
        assertEquals("1911efefeca07147c267a9e23738a131", b)
        assertNotEquals(a, b)
        assertEquals(32, a.length)
    }

    @Test fun sha256HexOfAbc() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Hashes.sha256Hex("abc".toByteArray()),
        )
    }
}
