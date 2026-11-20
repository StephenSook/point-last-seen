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

    @Test fun aParenthesizedAreaCodeWithSevenUnseparatedDigitsIsRemoved() {
        assertEquals("call [number removed]", PhoneNumbers.remove("call +1 (404) 5550142"))
        assertEquals("call [number removed]", PhoneNumbers.remove("call (404) 5550142"))
        assertEquals("call [number removed]", PhoneNumbers.remove("call (404)5550142"))
        assertEquals("call [number removed] now", PhoneNumbers.remove("call 404 5550142 now"))
    }

    @Test fun timesDatesSegmentsAndDistancesAreLeftAlone() {
        val text = "seen at 14:03 on 2026-11-22 in segment AC, about 300 m north, 2 people"
        assertEquals(text, PhoneNumbers.remove(text))
    }

    /** A written date (when someone was last seen) is search information, not a number. */
    @Test fun aWrittenDateIsKept() {
        for (text in listOf("Last seen 11/19/2026 at the mill", "Last seen 19.11.26", "Last seen 2026-11-19", "on 3/4/2026")) {
            assertEquals(text, PhoneNumbers.remove(text))
        }
        assertEquals("call [number removed]", PhoneNumbers.remove("call 404/555/0142"))
    }

    /** Spoken digits count like written ones, and so do digits in other scripts and full-width digits. */
    @Test fun spokenAndOtherScriptDigitsAreRemoved() {
        assertEquals("call [number removed] now", PhoneNumbers.remove("call four oh four five five five oh one four two now"))
        assertEquals("call [number removed]", PhoneNumbers.remove("call \u0664\u0660\u0664\u0665\u0665\u0665\u0660\u0661\u0664\u0662"))
        assertEquals("call [number removed]", PhoneNumbers.remove("call \uFF14\uFF10\uFF14\uFF15\uFF15\uFF15\uFF10\uFF11\uFF14\uFF12"))
    }

    /** Fewer than seven digits, or digits a word apart, are not a number. */
    @Test fun shortRunsAndWordsApartStay() {
        val text = "she is one of two, about 300 m north, walked 5 to 6 km, room 1204"
        assertEquals(text, PhoneNumbers.remove(text))
    }

    /** As on the iPhone: Chinese numeral digits are digits, and a pasted line break (CRLF) is one separator. */
    @Test fun chineseDigitsAndPastedLineBreaksAreCaught() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call \u56db\u96f6\u56db\u4e94\u4e94\u4e94\u96f6\u4e00\u56db\u4e8c"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404-555\r\n  0142"))
    }

    /** Dashes other than the plain hyphen (non-breaking, en, minus) join a number's parts too. */
    @Test fun unicodeDashesJoinANumber() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404\u2011555\u20110142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404\u2013555\u20130142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404\u2212555\u22120142"))
    }

    /**
     * A date carved out of a longer run is not a date: "06.12.20" inside a dotted number, or "2026-11-19" after a
     * US number's first groups. A date beside a whole number of its own stays, and the number goes.
     */
    @Test fun aDateNeverShieldsPartOfANumber() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 06.12.20.26.19"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404-555-2026-11-19"))
        assertEquals("Seen 11/19/2026 [number removed]", PhoneNumbers.remove("Seen 11/19/2026 404-555-0142"))
        assertEquals("Seen 11/19/2026, call [number removed]", PhoneNumbers.remove("Seen 11/19/2026, call 404-555-0142"))
    }

    /** Search information made of digits stays: coordinates, ordinals and units, grouped counts. */
    @Test fun coordinatesOrdinalsUnitsAndCountsStay() {
        for (text in listOf(
            "GPS 33.7490, -84.3880", "GPS 33.7490 -84.3880", "12345 67th Ave and 12345 68th Ave", "walked 1,234,567 steps",
            "about 2 5km loops", "Atlanta, GA 30301-1234",
        )) {
            assertEquals(text, PhoneNumbers.remove(text))
        }
    }

    /** A time or a month-name date beside a number stays; only the number goes. */
    @Test fun aTimeOrMonthDateBesideANumberStays() {
        assertEquals("Seen at 14:03, [number removed]", PhoneNumbers.remove("Seen at 14:03, 404-555-0142"))
        assertEquals("Nov 19 2026 [number removed]", PhoneNumbers.remove("Nov 19 2026 404-555-0142"))
        assertEquals("19 November 2026, [number removed]", PhoneNumbers.remove("19 November 2026, 404-555-0142"))
    }

    /** Spoken digits are read the same on a phone set to Turkish (root casing, not the device's). */
    @Test fun spokenDigitsInCapitalsAreCaughtOnATurkishPhone() {
        val before = java.util.Locale.getDefault()
        try {
            java.util.Locale.setDefault(java.util.Locale.forLanguageTag("tr-TR"))
            assertEquals("call [number removed]", PhoneNumbers.remove("call FOUR OH FOUR FIVE FIVE FIVE OH ONE FOUR TWO"))
        } finally {
            java.util.Locale.setDefault(before)
        }
    }
}
