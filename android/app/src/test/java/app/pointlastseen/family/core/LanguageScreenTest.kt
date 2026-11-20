package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Test

class LanguageScreenTest {
    /** Without its word lists the screen cannot tell, so it refuses the cloud read (fails closed). */
    @Test fun anUnloadedScreenRefusesEveryNote() {
        assertEquals(false, LanguageScreen.UNLOADED.looksEnglish("She walks to the old mill"))
    }

    /** A note with no words (only digits or marks) looks English, as on the web. */
    @Test fun aNoteWithNoWordsLooksEnglish() {
        assertEquals(true, LanguageScreen(emptySet(), emptySet(), 3, 2).looksEnglish("12 - 34"))
    }

    /** Words are folded as the evidence screen does: accents dropped, lower case, split on anything not a letter or digit. */
    @Test fun wordsAreFoldedAndSplit() {
        assertEquals(listOf("cafe", "naive", "x2"), LanguageScreen.words("Café, NAÏVE; x2 42"))
    }

    /** A word list that is empty or a threshold below 1 is broken: the file is refused, so the screen stays unloaded. */
    @Test fun aBrokenWordListIsRefused() {
        val good = """{"schemaVersion":1,"minForeign":3,"foreignOverEnglish":2,"english":["the"],"foreign":["la"]}"""
        LanguageScreen.parse(good)
        for (bad in listOf(
            good.replace(""""foreign":["la"]""", """"foreign":[]"""),
            good.replace(""""english":["the"]""", """"english":[]"""),
            good.replace(""""minForeign":3""", """"minForeign":0"""),
            good.replace(""""foreignOverEnglish":2""", """"foreignOverEnglish":0"""),
            good.replace(""""schemaVersion":1""", """"schemaVersion":2"""),
            good.replace(""""foreign":["la"]""", """"foreign":[""]"""),
            good.replace(""""foreign":["la"]""", """"foreign":["la casa"]"""),
            good.replace(""""english":["the"]""", """"english":["The"]"""),
        )) {
            assertEquals(bad, true, runCatching { LanguageScreen.parse(bad) }.isFailure)
        }
    }

    /** A character this phone's Unicode tables do not know cannot be read, so the note is refused for the cloud. */
    @Test fun aCharacterThisPhoneDoesNotKnowIsRefused() {
        val screen = LanguageScreen(setOf("she", "walks"), emptySet(), 3, 2)
        assertEquals(true, screen.looksEnglish("She walks"))
        assertEquals(false, screen.looksEnglish("She walks \u0378"))
    }
}
