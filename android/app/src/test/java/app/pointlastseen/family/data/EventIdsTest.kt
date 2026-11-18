package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class EventIdsTest {
    // Expected values computed independently with Python hashlib over the shared
    // framing: per field, decimal UTF-8 byte length, ":", the value; SHA-256; first 32 hex.
    @Test fun idMatchesTheIndependentReference() {
        assertEquals("eb7b8caf6385af1de7b1e524397ac087", EventIds.eventId("inc-1", "dev-1", 1))
        assertEquals("6d4a3b6e306b625d1eac38d1b5e554b0", EventIds.eventId("incident-ä", "device-9", 1234567890123))
    }

    @Test fun fieldsAreLengthPrefixedNotJoined() {
        val a = EventIds.eventId("ab", "c", 1)
        val b = EventIds.eventId("a", "bc", 1)
        assertEquals("cbbacd475c9794d2fa553fc5f713fab5", a) // hashes "2:ab1:c1:1"
        assertEquals("0af29a8dbb8ad574f3ba4eb12cdfff80", b) // hashes "1:a2:bc1:1"
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
