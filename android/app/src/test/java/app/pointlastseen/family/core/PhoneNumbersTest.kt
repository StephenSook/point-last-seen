package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneNumbersTest {
    @Test fun phoneNumbersAreRemoved() {
        assertEquals("call [number removed]", PhoneNumbers.remove("call 404-555-0142"))
        assertEquals("seen at 14:03", PhoneNumbers.remove("seen at 14:03"))
    }

    @Test fun commonShapesAreRemoved() {
        assertEquals(
            "call [number removed] or [number removed]",
            PhoneNumbers.remove("call (404) 555-0142 or 4045550142"),
        )
        assertEquals("ring [number removed] now", PhoneNumbers.remove("ring +1 404.555.0142 now"))
        assertEquals("neighbour [number removed]", PhoneNumbers.remove("neighbour 555-0142"))
    }

    @Test fun timesDatesSegmentsAndDistancesAreLeftAlone() {
        val text = "seen at 14:03 on 2026-11-22 in segment AC, about 300 m north, 2 people"
        assertEquals(text, PhoneNumbers.remove(text))
    }
}
