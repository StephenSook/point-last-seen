package app.pointlastseen.family.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.text.Normalizer

/**
 * The language screen run before a note may go to the cloud read (shared/constants/language-words.json,
 * `matching`; the web's looksEnglish). A note does not look English when more than half its words are non-Latin,
 * or when its foreign function words (plus non-Latin words) are at least [minForeign] and more than
 * [foreignOverEnglish] times its English words. An English note quoting Spanish still passes. Without its word
 * lists ([UNLOADED]) it refuses every note, so a broken install never sends one to the cloud.
 */
class LanguageScreen(
    private val english: Set<String>?,
    private val foreign: Set<String>,
    private val minForeign: Int,
    private val foreignOverEnglish: Int,
) {
    fun looksEnglish(text: String): Boolean {
        val englishWords = english ?: return false
        // A character this phone's Unicode tables do not know cannot be split or read, so the note is refused.
        if (text.codePoints().anyMatch { Character.getType(it) == Character.UNASSIGNED.toInt() }) return false
        val w = words(text)
        if (w.isEmpty()) return true
        val nonLatin = w.count { word -> word.any { it !in 'a'..'z' && it !in '0'..'9' } }
        if (nonLatin * 2 > w.size) return false
        val e = w.count { it in englishWords }
        val f = w.count { it in foreign } + nonLatin
        return !(f >= minForeign && f > foreignOverEnglish * e)
    }

    companion object {
        /** No word lists: every note is refused for the cloud read. */
        val UNLOADED = LanguageScreen(null, emptySet(), 0, 0)

        private val MARKS = Regex("""\p{M}+""")
        private val SPLIT = Regex("""[^\p{L}\p{N}]+""")
        private val ONLY_DIGITS = Regex("""\p{N}+""")

        /** Folds a note as the evidence screen does (NFKD, marks dropped, lower case) and splits it into words, dropping digit-only words. */
        fun words(text: String): List<String> {
            val folded = MARKS.replace(Normalizer.normalize(text, Normalizer.Form.NFKD), "").lowercase()
            return SPLIT.split(folded).filter { it.isNotEmpty() && !ONLY_DIGITS.matches(it) }
        }

        /**
         * Reads shared/constants/language-words.json (schema version 1). A file with an empty word list, an entry that
         * is not a string holding one folded word, a number written as text, or a threshold below 1 would let notes
         * through, so it is refused ([LanguageWords]
         * then keeps the screen unloaded). Thresholds out of tune are caught at build time instead: LanguageVectorsTest
         * runs the shared refuse cases against the same file the build ships.
         */
        fun parse(json: String): LanguageScreen {
            val o = Json.parseToJsonElement(json).jsonObject
            // A number must be a JSON number, and a word a JSON string: true or 3 in a list would read as a word.
            fun number(key: String) = o[key]!!.jsonPrimitive.also { require(!it.isString) { "$key is not a number" } }.int
            require(number("schemaVersion") == 1) { "unknown language-words schema" }
            // Each entry must be one word as the screen folds a note, or it could never match (an empty entry, a phrase).
            fun list(key: String) = o[key]!!.jsonArray.map { e ->
                e.jsonPrimitive.also { require(it.isString) { "an entry in $key is not a string" } }.content
            }.toSet().also { words ->
                require(words.isNotEmpty()) { "empty $key list" }
                require(words.all { words(it) == listOf(it) }) { "an entry in $key is not one folded word" }
            }
            fun threshold(key: String) = number(key).also { require(it >= 1) { "$key below 1" } }
            return LanguageScreen(list("english"), list("foreign"), threshold("minForeign"), threshold("foreignOverEnglish"))
        }
    }
}
