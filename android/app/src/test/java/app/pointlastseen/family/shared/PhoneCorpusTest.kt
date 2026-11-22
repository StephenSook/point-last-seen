package app.pointlastseen.family.shared

import app.pointlastseen.family.core.PhoneNumbers
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * shared/test-vectors/phone-numbers-corpus.json: notes the web app's scrubber was run over, with its output for each.
 * This app's scrubber must give byte for byte the same output on every one, so a port that drifts from the web rule
 * fails here. Every row runs; the failure names how many differ and the first few. A row whose input is the input of a
 * shared case pending on android but not on web (phone-numbers.json) is not held to the web's output yet, but it must
 * still differ from it: one that matches is ready to have android taken off its case. A case pending on web too is a
 * gap every platform shares, so its row is held to the web's output like any other.
 */
class PhoneCorpusTest {
    private val corpus = SharedFiles.json("shared/test-vectors/phone-numbers-corpus.json")
    private val vectors = SharedFiles.json("shared/test-vectors/phone-numbers.json")

    private fun rows(): List<CorpusRow> {
        val rows = corpus["rows"]!!.jsonArray.map { it.jsonObject }
            .map { CorpusRow(it["input"]!!.jsonPrimitive.content, it["output"]!!.jsonPrimitive.content) }
        assertTrue("rows in the corpus: ${rows.size}", rows.size >= 9_000)
        return rows
    }

    @Test fun theReplacementIsTheOneThisAppWrites() {
        assertEquals(corpus["replacement"]!!.jsonPrimitive.content, PhoneNumbers.REPLACEMENT)
    }

    @Test fun everyNoteComesOutAsTheWebAppGivesIt() {
        val rows = rows()
        val check = compareCorpus(rows, pendingOnAndroid(vectors), PhoneNumbers::remove)
        val first = check.differ.take(5).joinToString("\n") { r ->
            "input=${r.input.trim()} | web=${r.output} | android=${PhoneNumbers.remove(r.input)}"
        }
        assertEquals(
            "rows where this app differs from the web app (of ${rows.size}, ${check.skipped.size} pending here not compared):\n$first",
            0,
            check.differ.size,
        )
    }

    /** A corpus row of a case pending on android must still differ from the web's output, as the vector guard asks. */
    @Test fun everyRowPendingOnAndroidStillDiffersFromTheWebApp() {
        val check = compareCorpus(rows(), pendingOnAndroid(vectors), PhoneNumbers::remove)
        assertEquals("", check.unpend.joinToString("\n") { "un-pend $it: its corpus row matches the web app on android" })
    }

    /** Planted: a pending row that differs is not compared, and a pending row that matches the web fails by name. */
    @Test fun aPendingRowIsNotComparedButAMatchingOneMustBeUnpended() {
        val rows = listOf(CorpusRow("a", "A"), CorpusRow("b", "web-b"), CorpusRow("c", "C"))
        val check = compareCorpus(rows, mapOf("b" to "case_b", "c" to "case_c")) { it.uppercase() }
        assertEquals(emptyList<CorpusRow>(), check.differ)
        assertEquals(listOf(CorpusRow("b", "web-b"), CorpusRow("c", "C")), check.skipped)
        assertEquals(listOf("case_c"), check.unpend)
    }

    /** Planted: a row that no pending case names is still held to the web's output. */
    @Test fun aRowNoPendingCaseNamesStillHasToMatch() {
        val check = compareCorpus(listOf(CorpusRow("a", "web-a")), mapOf("b" to "case_b")) { it.uppercase() }
        assertEquals(listOf(CorpusRow("a", "web-a")), check.differ)
        assertEquals(emptyList<String>(), check.unpend)
    }

    /**
     * Planted: the pending inputs come from every kind of case whose pendingOn names android but not web. A case pending
     * on web too is a gap every platform shares: the web's corpus output is that shared output, so its row is still
     * held to it here.
     */
    @Test fun pendingInputsComeFromEveryKindOfCasePendingOnAndroidButNotWeb() {
        val planted = Json.parseToJsonElement(
            """
            {"mustRemove": [{"name": "r", "input": "in-r", "pendingOn": ["android", "ios"]},
                            {"name": "gap", "input": "in-gap", "pendingOn": ["ios", "web", "android"]}],
             "mustKeep": [{"name": "k", "input": "in-k", "pendingOn": ["ios"]}, {"name": "k2", "input": "in-k2"}],
             "exact": [{"name": "e", "input": "in-e", "output": "o", "pendingOn": ["android"]}]}
            """.trimIndent(),
        ).jsonObject
        assertEquals(mapOf("in-r" to "r", "in-e" to "e"), pendingOnAndroid(planted))
    }

    /** The shared gaps pending on every platform stay compared: today the cases pending here alone are the ones skipped. */
    @Test fun onlyCasesPendingHereAndNotOnWebAreSkipped() {
        val pending = pendingOnAndroid(vectors)
        val gaps = listOf("mustRemove", "mustKeep", "exact").flatMap { key -> vectors[key]!!.jsonArray.map { it.jsonObject } }
            .filter { c -> c["pendingOn"]?.jsonArray?.map { it.jsonPrimitive.content }?.containsAll(listOf("web", "android")) == true }
        assertTrue("shared gaps in the file: ${gaps.size}", gaps.isNotEmpty())
        for (g in gaps) assertTrue(g["name"]!!.jsonPrimitive.content, g["input"]!!.jsonPrimitive.content !in pending)
    }

    /** Every output is settled: scrubbing it again changes nothing, so text scrubbed at read and again at save comes out the same. */
    @Test fun everyOutputIsSettled() {
        val rows = rows()
        val unsettled = rows.map { it.output }.filter { PhoneNumbers.remove(it) != it }
        val first = unsettled.take(5).joinToString("\n") { "output=${it.trim()} | again=${PhoneNumbers.remove(it)}" }
        assertEquals("outputs a second scrub changes (of ${rows.size}):\n$first", 0, unsettled.size)
    }
}

/** One corpus row: a note and the web app's output for it. */
private data class CorpusRow(val input: String, val output: String)

/**
 * How this app compares with the web on a corpus: [differ] are rows held to the web's output that this app does not give,
 * [skipped] are rows of cases pending here (not compared), and [unpend] names each pending case whose row now matches.
 */
private class CorpusCheck(val differ: List<CorpusRow>, val skipped: List<CorpusRow>, val unpend: List<String>)

/** Compares [remove] with the web's output on every row; a row whose input is a key of [pending] is not compared. */
private fun compareCorpus(rows: List<CorpusRow>, pending: Map<String, String>, remove: (String) -> String): CorpusCheck {
    val (skipped, compared) = rows.partition { it.input in pending }
    return CorpusCheck(
        differ = compared.filter { remove(it.input) != it.output },
        skipped = skipped,
        unpend = skipped.filter { remove(it.input) == it.output }.map { pending.getValue(it.input) },
    )
}

/**
 * The input of every shared case (mustRemove, mustKeep or exact) whose pendingOn names android but not web, with the
 * case's name: the web's corpus output for it follows a rule this app does not yet.
 */
private fun pendingOnAndroid(vectors: JsonObject): Map<String, String> =
    listOf("mustRemove", "mustKeep", "exact")
        .flatMap { key -> vectors[key]?.jsonArray?.map { it.jsonObject }.orEmpty() }
        .filter { c ->
            val on = c["pendingOn"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
            "android" in on && "web" !in on
        }
        .groupBy({ it["input"]!!.jsonPrimitive.content }, { it["name"]!!.jsonPrimitive.content })
        .mapValues { (_, names) -> names.joinToString(", ") }
