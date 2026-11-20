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
         * Reads shared/constants/language-words.json (schema version 1). A file with an empty word list or a threshold
         * below 1 would let notes through, so it is refused ([LanguageWords] then keeps the screen unloaded).
         */
        fun parse(json: String): LanguageScreen {
            val o = Json.parseToJsonElement(json).jsonObject
            require(o["schemaVersion"]!!.jsonPrimitive.int == 1) { "unknown language-words schema" }
            fun list(key: String) = o[key]!!.jsonArray.map { it.jsonPrimitive.content }.toSet().also { require(it.isNotEmpty()) { "empty $key list" } }
            fun threshold(key: String) = o[key]!!.jsonPrimitive.int.also { require(it >= 1) { "$key below 1" } }
            return LanguageScreen(list("english"), list("foreign"), threshold("minForeign"), threshold("foreignOverEnglish"))
        }
    }
}
