package app.pointlastseen.family.shared

import app.pointlastseen.family.core.PhoneNumbers
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * shared/test-vectors/phone-numbers-corpus.json: notes the web app's scrubber was run over, with its output for each.
 * This app's scrubber must give byte for byte the same output on every one, so a port that drifts from the web rule
 * fails here. Every row runs; the failure names how many differ and the first few.
 */
class PhoneCorpusTest {
    private val corpus = SharedFiles.json("shared/test-vectors/phone-numbers-corpus.json")

    @Test fun theReplacementIsTheOneThisAppWrites() {
        assertEquals(corpus["replacement"]!!.jsonPrimitive.content, PhoneNumbers.REPLACEMENT)
    }

    @Test fun everyNoteComesOutAsTheWebAppGivesIt() {
        val rows = corpus["rows"]!!.jsonArray.map { it.jsonObject }
        assertTrue("rows in the corpus: ${rows.size}", rows.size >= 9_000)
        val differ = rows.filter { r -> PhoneNumbers.remove(r["input"]!!.jsonPrimitive.content) != r["output"]!!.jsonPrimitive.content }
        val first = differ.take(5).joinToString("\n") { r ->
            val input = r["input"]!!.jsonPrimitive.content
            "input=${input.trim()} | web=${r["output"]!!.jsonPrimitive.content} | android=${PhoneNumbers.remove(input)}"
        }
        assertEquals("rows where this app differs from the web app (of ${rows.size}):\n$first", 0, differ.size)
    }

    /** Every output is settled: scrubbing it again changes nothing, so text scrubbed at read and again at save comes out the same. */
    @Test fun everyOutputIsSettled() {
        val rows = corpus["rows"]!!.jsonArray.map { it.jsonObject }
        assertTrue("rows in the corpus: ${rows.size}", rows.size >= 9_000)
        val unsettled = rows.map { it["output"]!!.jsonPrimitive.content }.filter { PhoneNumbers.remove(it) != it }
        val first = unsettled.take(5).joinToString("\n") { "output=${it.trim()} | again=${PhoneNumbers.remove(it)}" }
        assertEquals("outputs a second scrub changes (of ${rows.size}):\n$first", 0, unsettled.size)
    }
}
