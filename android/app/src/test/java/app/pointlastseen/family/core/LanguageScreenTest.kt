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
}
