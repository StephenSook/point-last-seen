package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {
    /** Any punctuation or symbol between digit groups joins them, except the marks of a time, a percent and a degree. */
    @Test fun anyGapMarkJoinsExceptTimePercentAndDegree() {
        assertEquals("Call [number removed] tonight", PhoneNumbers.remove("Call 404\u00B7555\u00B70142 tonight"))
        assertEquals("Call [number removed] tonight", PhoneNumbers.remove("Call 404\u2022555\u20220142 tonight"))
        assertEquals("Call [number removed] tonight", PhoneNumbers.remove("Call 404_555_0142 tonight"))
        assertEquals("Call [number removed] tonight", PhoneNumbers.remove("Call 404 | 555 | 0142 tonight"))
        assertEquals("POA 45% 30% 15% 10%", PhoneNumbers.remove("POA 45% 30% 15% 10%"))
        assertEquals("Seen 14:03 14:30", PhoneNumbers.remove("Seen 14:03 14:30"))
        assertEquals("GPS 33.7490\u00B0, -84.3880\u00B0", PhoneNumbers.remove("GPS 33.7490\u00B0, -84.3880\u00B0"))
    }

    /** A coordinate pair across ; or a bar, and a radio frequency list, stay; a number split by ; | ! ? is still removed. */
    @Test fun coordinatesAndFrequenciesStayWhileSplitNumbersGo() {
        for (note in listOf("GPS 33.7490; -84.3880", "GPS 33.7490 \u2022 -84.3880", "Radio 155.160 | 154.205")) {
            assertEquals(note, PhoneNumbers.remove(note))
        }
        for (note in listOf("Call 404 | 555 | 0142 tonight", "Call 404;555;0142 tonight", "Call 404!555!0142 tonight", "Call 404?555?0142 tonight")) {
            assertEquals("Call [number removed] tonight", PhoneNumbers.remove(note))
        }
    }

    /** A ; bullet dot bar or slash joins a coordinate pair only with a minus after it, so two dotted numbers are not a pair. */
    @Test fun twoDottedNumbersAcrossASlashOrBarAreNotACoordinatePair() {
        for (note in listOf("Call 020.79460958 / 020.79460959", "Call 020.79460958 | 020.79460959")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, out.contains("79460958") || out.contains("79460959"))
        }
        assertEquals("GPS 33.7490 / -84.3880", PhoneNumbers.remove("GPS 33.7490 / -84.3880"))
    }

    /** A frequency stays only when every number joined to it is a frequency too; beside other digits it goes with the run. */
    @Test fun aFrequencyJoinedToOtherDigitsGoesWithTheRun() {
        val out = PhoneNumbers.remove("Call 404.555-0142 #123")
        assertFalse(out, out.contains("404") || out.contains("555") || out.contains("0142"))
        assertEquals("Radio [number removed]", PhoneNumbers.remove("Radio 155.160 404 5550142"))
        assertEquals("Radio 155.160 | 154.205", PhoneNumbers.remove("Radio 155.160 | 154.205"))
    }

    /** Whole degrees never start with a zero, so a London number beside a coordinate is no pair and goes. */
    @Test fun aWholeDegreeWithALeadingZeroIsNoCoordinate() {
        for (note in listOf("Call 020.79460958 | -0.1276", "Call 020.79460958, -0.1276")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, out.contains("79460958"))
        }
        assertEquals("GPS 0.1276, -51.5072", PhoneNumbers.remove("GPS 0.1276, -51.5072"))
    }

    /**
     * A frequency is 25 to 999 with no leading zero, and stays only in a run of frequencies: a candidate whose joined
     * neighbour drops out drops out too, until nothing changes.
     */
    @Test fun frequenciesStayOnlyInARunOfFrequencies() {
        for (note in listOf("Call 404.555 0.142 1234567", "Call 404.555 100.142 1234567")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, out.contains("404") || out.contains("555") || out.contains("1234567"))
        }
        assertEquals("Radio 27.185 155.160 462.550", PhoneNumbers.remove("Radio 27.185 155.160 462.550"))
    }

    /**
     * Two decimals are a coordinate pair only with the western minus between them, 4 to 7 decimals each, and no phone cue
     * just before: Mexican 10-digit numbers in dot form go.
     */
    @Test fun mexicanNumbersInDotFormAreNoCoordinatePair() {
        for (note in listOf("Call 33.12345678, 33.87654321", "55.12345678, 55.87654321", "Call 33.12345678, -103.3496",
            "33.12345678 / -81.12345678")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, out.contains("12345678") || out.contains("87654321"))
        }
        for (note in listOf("Call 33.7490, -84.3880", "Call: 33.7490, -84.3880", "Llame al 33.7490, -84.3880", "#33.7490, -84.3880")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, out.contains("7490") || out.contains("3880"))
        }
        // A cue further back names a thing, not a number to dial: the place a phone was found stays.
        for (note in listOf("GPS 33.7490, -84.3880", "Punto 19.4326, -99.1332", "Last seen 33.7490 -84.3880",
            "Phone found at 33.7866, -84.3733")) {
            assertEquals(note, PhoneNumbers.remove(note))
        }
    }

    /**
     * A run of clock times the rule reads as its own group stays in clock order with no phone cue before it; out of
     * order, or after a cue (a cue word among the three words before it, or a "#"), the whole run goes.
     */
    @Test fun aRunOfTimesStaysInClockOrderAndGoesWholeOutOfOrderOrAfterACue() {
        assertEquals("The possible times are 14:03, 14:10, 14:17.", PhoneNumbers.remove("The possible times are 14:03, 14:10, 14:17."))
        assertEquals("Times 14:03, 14:10, 14:17. Call [number removed]", PhoneNumbers.remove("Times 14:03, 14:10, 14:17. Call 404 555 0142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call four 4:04 5:55 6:42"))
        for (note in listOf("Call 21:25 5:50 1:42 tonight", "Call 21:25, 5:50, 1:42 tonight", "Try 12:12 5:55 01:42 tonight",
            "Call\t4:04 5:55 16:42 tonight", "Reach me at 4:04 5:55 06:42 tonight", "Call (4:04 5:55 16:43) tonight", "Note #4:04 5:55 06:42")) {
            val out = PhoneNumbers.remove(note)
            assertFalse(out, Regex("[0-9]").containsMatchIn(out))
            assertTrue(out, out.contains(PhoneNumbers.REPLACEMENT))
        }
    }

    /** A digit between a phone cue and a run of times, written or spoken, never hides the cue. */
    @Test fun aDigitBetweenACueAndARunOfTimesNeverHidesTheCue() {
        val spoken = PhoneNumbers.remove("Call one: 4:04 5:55 6:42 tonight")
        assertFalse(spoken, Regex("[0-9]").containsMatchIn(spoken))
        assertEquals("Call 5 at [number removed] tonight", PhoneNumbers.remove("Call 5 at 4:04 5:55 06:44 tonight"))
        assertEquals("The possible times are 14:03, 14:10, 14:17.", PhoneNumbers.remove("The possible times are 14:03, 14:10, 14:17."))
    }

    /**
     * A "[number removed]" already in a note is read past like digits when looking for a cue before a run of times: its
     * "number" is never a cue, so a second pass reads the same words before the run as the first did.
     */
    @Test fun aMarkerAlreadyInANoteIsNeverACue() {
        assertEquals("Witness [number removed] at 14:03 14:10", PhoneNumbers.remove("Witness [number removed] at 14:03 14:10"))
        val once = PhoneNumbers.remove("Witness 4045550142 at 14:03 14:10")
        assertEquals("Witness [number removed] at 14:03 14:10", once)
        assertEquals(once, PhoneNumbers.remove(once))
        assertEquals("Call [number removed] [number removed]", PhoneNumbers.remove("Call [number removed] 21:25 5:50 1:42"))
        assertEquals("Call [number removed] at [number removed]", PhoneNumbers.remove("Call 404 555 0142 at 4:04 5:55 6:42"))
    }

    /**
     * A "[number removed]" right before or after a run of times, with no letter or digit between, stands for digits
     * joined to the run, so the whole run goes: "Dial [number removed] 4:04 5:55 12:12" is 404-555-1212.
     */
    @Test fun aRunOfTimesRightBesideAMarkerGoesWhole() {
        assertEquals("Dial [number removed] [number removed]", PhoneNumbers.remove("Dial [number removed] 4:04 5:55 12:12"))
        assertEquals("[number removed] [number removed] tonight", PhoneNumbers.remove("4:04 5:55 12:12 [number removed] tonight"))
        assertEquals("Witness [number removed] at 14:03 14:10", PhoneNumbers.remove("Witness [number removed] at 14:03 14:10"))
        assertEquals("Call [number removed] at [number removed]", PhoneNumbers.remove("Call [number removed] at 4:04 5:55 6:42"))
        assertEquals("Seen [number removed], [number removed] called", PhoneNumbers.remove("Seen 14:03 14:10, [number removed] called"))
        assertEquals("Seen 14:03 14:10 then [number removed]", PhoneNumbers.remove("Seen 14:03 14:10 then [number removed]"))
    }

    /** A month name beside a run of times reads an hour or minutes as a day, so the run is left to the rule as a whole. */
    @Test fun aRunOfTimesBesideAMonthNameIsLeftToTheRule() {
        assertEquals("[number removed] May 6:00 7:00", PhoneNumbers.remove("1.4045, -55.0142 14 May 6:00 7:00"))
    }

    /** Spanish digit words count as digits, as the shared rule names them; "un" and "una" are articles and do not. */
    @Test fun spanishDigitWordsAreDigits() {
        assertEquals("Call [number removed], she has the dog.", PhoneNumbers.remove("Call cuatro cero cuatro cinco cinco cinco cero uno cuatro dos, she has the dog."))
        assertEquals("Number: [number removed]", PhoneNumbers.remove("Number: Seis-Siete-Ocho-Nueve-Tres-Dos-Uno-Cero-Cinco-Cuatro"))
        assertEquals("Vimos dos niños y tres perros cerca del lago.", PhoneNumbers.remove("Vimos dos niños y tres perros cerca del lago."))
        assertEquals("Tiene un perro y una gata", PhoneNumbers.remove("Tiene un perro y una gata"))
    }

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
        // The line break is kept (each line gets its own mark), so two lines never become one.
        assertEquals("Call [number removed]\n[number removed]", PhoneNumbers.remove("Call 404-555\r\n  0142"))
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

    /** Search information made of digits stays: coordinates, ordinals and units, a short count. */
    @Test fun coordinatesOrdinalsUnitsAndCountsStay() {
        for (text in listOf(
            "GPS 33.7490, -84.3880", "GPS 33.7490 -84.3880", "12345 67th Ave and 12345 68th Ave", "walked 12,345 steps",
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

    /** A phone number written up against something shaped like search information still goes: nothing of it is left. */
    @Test fun aNumberShapedLikeSearchInformationStillGoes() {
        val cases = mapOf(
            "404.5550142, -84.3880" to listOf("5550142", "404"),
            "Call 1,404,555,0142" to listOf("0142", "555"),
            "Call 91234-5678" to listOf("91234", "5678"),
            "May 4 2026-555-142" to listOf("555", "142"),
            "Call 404-555-19 May" to listOf("404", "555"),
            "Call 404-555-01:42" to listOf("404", "555"),
            "call 404-555-0142m" to listOf("404", "0142"),
            "Call 1-404-555-2026-11-19" to listOf("404", "555"),
        )
        for ((input, gone) in cases) {
            val out = PhoneNumbers.remove(input)
            for (g in gone) assertEquals("$input -> $out", false, out.contains(g))
        }
        assertEquals("\u7535\u8bdd[number removed]", PhoneNumbers.remove("\u7535\u8bdd\u56db\u96f6\u56db\u4e94\u4e94\u4e94\u96f6\u4e00\u56db\u4e8c"))
    }

    /** Dates written with en dashes, and a date followed by a quantity, stay; a ZIP after a state stays beside a number. */
    @Test fun datesAndAddressedZipCodesStay() {
        assertEquals("Seen 2026\u201311\u201319", PhoneNumbers.remove("Seen 2026\u201311\u201319"))
        assertEquals("Atlanta, GA 30301-1234 [number removed]", PhoneNumbers.remove("Atlanta, GA 30301-1234 404-555-0142"))
    }

    /**
     * A short number touching a written date could be part of a number, so the whole run goes (privacy first; the
     * date is lost with it). A 5-4 number with no state before it goes.
     */
    @Test fun aShortNumberTouchingADateTakesTheDateWithItAndAnUnaddressedFiveFourNumberGoes() {
        for (text in listOf("team 5 11/19/2026", "zone 2 2026-11-19", "route 66 11/19/2026", "room 1204 11/19/2026", "Seen 11/19/2026, 3 miles north")) {
            assertEquals("$text -> ${PhoneNumbers.remove(text)}", false, PhoneNumbers.remove(text).any { it.isDigit() })
        }
        assertEquals("call [number removed]", PhoneNumbers.remove("call 40455-0142"))
        assertEquals("call [number removed]", PhoneNumbers.remove("call 08001-1234"))
        assertEquals("call [number removed]ft", PhoneNumbers.remove("call 404-555-0142ft"))
    }

    /**
     * A search span with a short piece of digits beside it takes the whole run with it: nothing of a number written
     * around a ZIP, a count, a date, a time or a unit is left.
     */
    @Test fun aSpanBesideAShortPieceTakesTheWholeRun() {
        val cases = mapOf(
            "Call GA 40455-5014 2" to listOf("40455", "5014"),
            "Call 404,555,014 two" to listOf("404", "014", "two"),
            "Call 4.0455 5.0142" to listOf("0455", "0142"),
            "Call Nov 20 1955 0142" to listOf("1955", "0142"),
            "Call four zero four five five five 0142ft" to listOf("four", "0142"),
            "Call 404 5-15-2026" to listOf("404", "2026"),
            "Call 25/12/26-9-1-26" to listOf("25/12", "9-1"),
            "call 555 0142m" to listOf("555", "0142"),
            "Call 06.12.20-26-19" to listOf("06.12", "26-19"),
            "Call 404-555-2026/11/19" to listOf("404", "555"),
            "Call 404.555.2026-11-19" to listOf("404", "555"),
            "Meet in Atlanta, ga 30301-1234" to listOf("30301"),
        )
        for ((input, gone) in cases) {
            val out = PhoneNumbers.remove(input)
            for (g in gone) assertEquals("$input -> $out", false, out.contains(g))
        }
    }

    /** Search information beside a whole number stays, and only the number goes. */
    @Test fun searchInformationBesideAWholeNumberStays() {
        assertEquals("Seen 11/19/2026 14:03 [number removed]", PhoneNumbers.remove("Seen 11/19/2026 14:03 404-555-0142"))
        assertEquals("GA 30301-1234 [number removed]", PhoneNumbers.remove("GA 30301-1234 555 0142"))
        assertEquals("14:03 [number removed]", PhoneNumbers.remove("14:03 five five five zero one four two"))
    }

    /** A removed run keeps its line breaks, so two lines never become one. */
    @Test fun aRemovedRunKeepsItsLineBreaks() {
        assertEquals("Trail marker [number removed]\n[number removed] Oak Road", PhoneNumbers.remove("Trail marker 1234\n5678 Oak Road"))
    }

    /** The final review's cases: a unit on a whole number, overlapping dates, an indented line break, "triple five". */
    @Test fun theFinalReviewsNumbersGo() {
        assertEquals("Call [number removed]pm", PhoneNumbers.remove("Call 4045550142pm"))
        val cases = mapOf(
            "Call 06.12.20-06-19" to listOf("06.12", "06-19"),
            "Call +1 (404) 555-\n    0142" to listOf("404", "0142"),
            "Call +1 (404) 555-\r0142" to listOf("404", "0142"),
            "Call four oh four, triple five, zero one four two" to listOf("four", "triple", "zero"),
            "Call double four zero four five five five one four two" to listOf("double", "five"),
        )
        for ((input, gone) in cases) {
            val out = PhoneNumbers.remove(input)
            for (g in gone) assertEquals("$input -> $out", false, out.contains(g))
        }
    }

    /** Search information split by a pasted line break (CRLF, with or without an indent) stays beside a whole number, as on the iPhone. */
    @Test fun aLineBreakInsideADateOrCoordinatesKeepsThemBesideANumber() {
        assertEquals("Seen Nov \r\n19 2026 [number removed]", PhoneNumbers.remove("Seen Nov \r\n19 2026 404-555-0142"))
        assertEquals("Seen Nov 19,\r\n2026 [number removed]", PhoneNumbers.remove("Seen Nov 19,\r\n2026 404-555-0142"))
        assertEquals("Seen 19\r\n  November 2026 [number removed]", PhoneNumbers.remove("Seen 19\r\n  November 2026 404-555-0142"))
        assertEquals("GPS 33.7490,\r\n-84.3880 [number removed]", PhoneNumbers.remove("GPS 33.7490,\r\n-84.3880 404-555-0142"))
    }

    /** A spacing accent between groups (which NFKC turns into a space and a combining mark) still joins them. */
    @Test fun aSpacingAccentBetweenGroupsJoinsThem() {
        for (sep in listOf("\u00B4", "\u00A8", "\u02DC", " \u0301", " \u200D")) {
            val out = PhoneNumbers.remove("Call 404${sep}555${sep}0142")
            assertEquals("$sep -> $out", false, out.any { it.isDigit() })
        }
    }

    /** NEL and the Unicode line and paragraph separators are line breaks between groups, and the break is kept. */
    @Test fun otherLineBreaksJoinGroups() {
        for (br in listOf("\u0085", "\u2028", "\u2029")) {
            val out = PhoneNumbers.remove("Call 404-555-${br}0142")
            assertEquals("U+${"%04X".format(br[0].code)} -> $out", false, out.any { it.isDigit() })
        }
    }

    /** Characters the iPhone reads as digits count here too: the spoken "幺" (one) and circled dingbat digits. */
    @Test fun spokenYaoAndDingbatDigitsCount() {
        assertEquals("电话[number removed]", PhoneNumbers.remove("电话幺三八幺二三四五六七八"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call \u2779\u2777\u2779 \u277A\u277A\u277A \u24FF\u2776\u2779\u2778"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call \u278D\u278A\u278D-\u278E\u278E\u278E-\u278A\u278B\u278D\u278C"))
    }

    /** A phone number written in digits outside the BMP (Adlam) with commas is not taken for a grouped count. */
    @Test fun anAdlamNumberWithCommasIsRemoved() {
        val adlam = "Call \uD83A\uDD54,\uD83A\uDD50\uD83A\uDD54\uD83A\uDD55,\uD83A\uDD55\uD83A\uDD55\uD83A\uDD50,\uD83A\uDD51\uD83A\uDD54\uD83A\uDD52"
        assertEquals("Call [number removed]", PhoneNumbers.remove(adlam))
    }

    /** "OH" before a 5-4 shape is still a spoken zero: read aloud it can be the start of a phone number. */
    @Test fun aCapitalOhBeforeAZipShapeIsStillASpokenZero() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call OH 41234-5678"))
    }

    /** An indent after a line break is no coordinate gap: a number split across lines is never read as a pair. */
    @Test fun anIndentedLineBreakIsNoCoordinateGap() {
        assertEquals("Call [number removed]\n[number removed]", PhoneNumbers.remove("Call +44.2071\r\n    -23.4567"))
        assertEquals("GPS 33.7490,\r\n -84.3880 x", PhoneNumbers.remove("GPS 33.7490,\r\n -84.3880 x"))
    }

    /** A wider gap of separators alone (spaces, dashes, dots) still joins the groups of one number. */
    @Test fun aWideGapOfSeparatorsStillJoins() {
        for (text in listOf("Call 404-555 -  0142", "Call 404    555    0142", "Call 404 . . 555 . . 0142")) {
            assertEquals(text, "Call [number removed]", PhoneNumbers.remove(text))
        }
    }

    /** A unit glued to the last group of a number does not shield it: the whole number goes. */
    @Test fun aUnitGluedToTheLastGroupShieldsNothing() {
        for (text in listOf("Call 1-404-555-0142pm", "Call 1 404 555 0142pm", "Call 404-555-0142 5km")) {
            val out = PhoneNumbers.remove(text)
            assertEquals("$text -> $out", false, out.any { it.isDigit() })
        }
    }

    /** A count of seven or more digits with thousands commas is a number like any other: it can be a phone number. */
    @Test fun aGroupedCountOfSevenOrMoreDigitsIsRemoved() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 4,045,550,142"))
        assertEquals("walked [number removed] steps", PhoneNumbers.remove("walked 1,234,567 steps"))
        assertEquals("[number removed]", PhoneNumbers.remove("1,234,567 555 0142"))
        assertEquals("walked 12,345 steps", PhoneNumbers.remove("walked 12,345 steps"))
    }

    /** A mark or format character outside the BMP (a tag character, a supplementary variation selector) between groups counts as nothing too. */
    @Test fun aMarkOutsideTheBmpBetweenGroupsJoinsThem() {
        for (sep in listOf("\uDB40\uDC20", "\uDB40\uDD00", "\u0903")) {
            val out = PhoneNumbers.remove("Call 404${sep}555${sep}0142")
            assertEquals(out, false, out.any { it.isDigit() })
        }
    }

    /** Only a number of one to three digits takes an ordinal ending (67th, 125th): a fourth group ending in "th" still joins. */
    @Test fun aLongGroupWithAnOrdinalEndingStillJoins() {
        for (text in listOf("Call 404-555-0142th", "Call 404 555 0142nd")) {
            val out = PhoneNumbers.remove(text)
            assertEquals("$text -> $out", false, out.any { it.isDigit() })
        }
        assertEquals("12345 67th Ave and 12345 125th St", PhoneNumbers.remove("12345 67th Ave and 12345 125th St"))
    }

    /**
     * A valid date beside a number stays and the number goes: when someone was seen is search information. A time
     * joined before its hour to other digits could be a number's last four, so it goes with them.
     */
    @Test fun aDateBesideANumberStaysAndAJoinedTimeGoes() {
        assertEquals("Seen 11/19/2026 [number removed]", PhoneNumbers.remove("Seen 11/19/2026 404-555-0142"))
        assertEquals("Seen 2026-11-19 [number removed]", PhoneNumbers.remove("Seen 2026-11-19 404-555-0142"))
        assertEquals("Seen Nov 19 2026 [number removed]", PhoneNumbers.remove("Seen Nov 19 2026 404-555-0142"))
        assertEquals("Seen 11/19/2026, call [number removed]", PhoneNumbers.remove("Seen 11/19/2026, call 404-555-0142"))
        assertEquals("Seen 11/19/2026 14:03", PhoneNumbers.remove("Seen 11/19/2026 14:03"))
        assertEquals("Seen 11/19/2026 14:03 [number removed]", PhoneNumbers.remove("Seen 11/19/2026 14:03 404-555-0142"))
        assertEquals("Seen at 14:03, [number removed]", PhoneNumbers.remove("Seen at 14:03, 404-555-0142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 1 404 555 01:42"))
    }

    /** An ordinal stays apart only as a street name (67th Ave, 125th St); without a street word it joins the number. */
    @Test fun anOrdinalStaysApartOnlyAsAStreetName() {
        for (text in listOf("Call 4550 142nd", "Call 455 0142th please")) {
            val out = PhoneNumbers.remove(text)
            assertEquals("$text -> $out", false, Regex("""\d{4}""").containsMatchIn(out))
        }
        assertEquals("12345 67th Ave. and 12345 125th Street", PhoneNumbers.remove("12345 67th Ave. and 12345 125th Street"))
        assertEquals("near 4550 142nd St", PhoneNumbers.remove("near 4550 142nd St"))
    }

    /** Two decimals joined by a bare minus are no coordinate pair; a pair has a comma or a space before the minus. */
    @Test fun twoDecimalsJoinedByABareMinusAreNoCoordinates() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 44.2071-23.4567"))
        assertEquals("GPS 33.7490 -84.3880", PhoneNumbers.remove("GPS 33.7490 -84.3880"))
        assertEquals("GPS 33.7490,-84.3880", PhoneNumbers.remove("GPS 33.7490,-84.3880"))
    }

    /** Dropping a time never lets other search information keep a number: a short piece seen before the drop still takes the whole run. */
    @Test fun droppingATimeNeverShieldsTheRestOfTheRun() {
        assertEquals("Call GA [number removed]", PhoneNumbers.remove("Call GA 40455-5014 2 01:42"))
    }

    /** A month and day written with a slash (11/19) is a date: beside a number it stays, and the number goes. */
    @Test fun aMonthAndDayWithASlashStaysBesideANumber() {
        assertEquals("Seen 11/19 [number removed]", PhoneNumbers.remove("Seen 11/19 555-0142"))
        assertEquals("Seen 19/11 [number removed]", PhoneNumbers.remove("Seen 19/11 404-555-0142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 404/555/0142"))
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call 12/31/55/0142"))
    }

    /** A time keeps its place only after a date: after a ZIP+4 code (or any other digits) it goes with the number. */
    @Test fun aTimeAfterAZipCodeGoesWithTheNumber() {
        assertEquals("Call GA [number removed]", PhoneNumbers.remove("Call GA 40455-5014 2:30"))
        assertEquals("Seen 11/19/2026 14:03", PhoneNumbers.remove("Seen 11/19/2026 14:03"))
    }

    /** A "+" right before the first number makes a pair of decimals a phone number, not coordinates. */
    @Test fun aPlusBeforeThePairMakesItANumber() {
        assertEquals("Call [number removed]", PhoneNumbers.remove("Call +44.2071, -23.4567"))
        assertEquals("GPS 33.7490, -84.3880", PhoneNumbers.remove("GPS 33.7490, -84.3880"))
    }

    /** Joining a dropped time's minutes never hides the short piece its hour leaves: the whole run still goes. */
    @Test fun aJoinedTimeStillLeavesItsHourAShortPiece() {
        assertEquals("Call GA [number removed]", PhoneNumbers.remove("Call GA 40455-5014 2:30 555-0142"))
    }
}
