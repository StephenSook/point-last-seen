package app.pointlastseen.family.shared

import app.pointlastseen.family.core.LanguageScreen
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** shared/test-vectors/language.json against shared/constants/language-words.json: the same cases on every platform. */
class LanguageVectorsTest {
    private val screen = LanguageScreen.parse(SharedFiles.text("shared/constants/language-words.json"))
    private val vectors = SharedFiles.json("shared/test-vectors/language.json")

    private fun check(key: String, floor: Int, expected: Boolean) {
        val cases = vectors[key]!!.jsonArray
        assertTrue("$key cases walked: ${cases.size}", cases.size >= floor)
        for (c in cases) {
            val o = c.jsonObject
            assertEquals(o["name"]!!.jsonPrimitive.content, expected, screen.looksEnglish(o["input"]!!.jsonPrimitive.content))
        }
    }

    @Test fun everyMustAllowNoteLooksEnglish() = check("mustAllow", 18, true)

    @Test fun everyMustRefuseNoteIsRefused() = check("mustRefuse", 9, false)

    /** Known misses pass as English on purpose, so every platform gets them wrong the same way. */
    @Test fun everyKnownMissPassesAsEnglish() = check("knownMiss", 1, true)
}
