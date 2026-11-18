package app.pointlastseen.family.core

import kotlinx.serialization.json.Json
import java.text.Normalizer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Possible-evidence pre-screen (spec R8). A match sends the text to no model.
 * Matching follows shared/constants/evidence-terms.json: NFKD-normalize, drop
 * combining marks, lowercase, split on anything that is not a letter or digit;
 * a term matches when its words appear consecutively. With no term list it
 * fails closed: every text counts as possible evidence.
 */
class EvidenceScreen(terms: List<String>?) {
    private val termWords: List<List<String>>? = terms?.map { words(it) }?.filter { it.isNotEmpty() }

    fun isPossibleEvidence(text: String): Boolean {
        val list = termWords ?: return true
        if (list.isEmpty()) return true
        val w = words(text)
        return list.any { term -> containsRun(w, term) }
    }

    companion object {
        private val MARKS = Regex("\\p{M}+")
        private val SPLIT = Regex("[^\\p{L}\\p{N}]+")

        fun words(text: String): List<String> {
            val folded = MARKS.replace(Normalizer.normalize(text, Normalizer.Form.NFKD), "").lowercase()
            return folded.split(SPLIT).filter { it.isNotEmpty() }
        }

        private fun containsRun(words: List<String>, term: List<String>): Boolean {
            if (term.size > words.size) return false
            for (i in 0..words.size - term.size) {
                if ((term.indices).all { words[i + it] == term[it] }) return true
            }
            return false
        }

        /** Terms from the shared file, or null (fail closed) when it cannot be read. */
        fun parseTerms(json: String): List<String>? = runCatching {
            val arr = Json.parseToJsonElement(json).jsonObject["terms"] as JsonArray
            arr.map { it.jsonPrimitive.content }
        }.getOrNull()
    }
}
