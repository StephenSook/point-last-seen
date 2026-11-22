package app.pointlastseen.family.shared

import app.pointlastseen.family.core.PhoneNumbers
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * shared/test-vectors/phone-numbers.json: the same phone-number cases every platform's scrubber must pass. A case
 * whose `pendingOn` names android is one this platform cannot pass yet; it is counted, never run.
 */
class PhoneVectorsTest {
    private val vectors = SharedFiles.json("shared/test-vectors/phone-numbers.json")
    private val replacement = vectors["replacement"]!!.jsonPrimitive.content

    // The contract's "no digit left" check: any Unicode number character (Nd, Nl, No), not only 0-9, so a leftover
    // Adlam or dingbat digit cannot pass.
    private fun isNumber(cp: Int) = Character.getType(cp).toByte().let {
        it == Character.DECIMAL_DIGIT_NUMBER || it == Character.LETTER_NUMBER || it == Character.OTHER_NUMBER
    }

    private fun cases(key: String, floor: Int): List<JsonObject> {
        val all = vectors[key]!!.jsonArray.map { it.jsonObject }
        assertTrue("$key cases in the file: ${all.size}", all.size >= floor)
        val run = all.filter { c -> c["pendingOn"]?.jsonArray?.none { it.jsonPrimitive.content == "android" } ?: true }
        assertTrue("$key cases run on android: ${run.size}", run.isNotEmpty())
        return run
    }

    @Test fun theReplacementIsTheOneThisAppWrites() {
        assertEquals(replacement, PhoneNumbers.remove("Call 404-555-0142").removePrefix("Call "))
    }

    @Test fun everyMustRemoveCaseLosesItsNumberAndKeepsItsText() {
        for (o in cases("mustRemove", 13)) {
            val name = o["name"]!!.jsonPrimitive.content
            val out = PhoneNumbers.remove(o["input"]!!.jsonPrimitive.content)
            assertFalse("$name: the number is gone", out.contains(o["number"]!!.jsonPrimitive.content))
            assertFalse("$name: no number character is left: $out", out.codePoints().anyMatch { isNumber(it) })
            for (f in o["forbidden"]!!.jsonArray) assertFalse("$name: no ${f.jsonPrimitive.content}", out.contains(f.jsonPrimitive.content))
            for (k in o["keep"]!!.jsonArray) assertTrue("$name: keeps ${k.jsonPrimitive.content}", out.contains(k.jsonPrimitive.content))
        }
    }

    @Test fun everyMustKeepCaseIsUnchanged() {
        for (o in cases("mustKeep", 16)) {
            val input = o["input"]!!.jsonPrimitive.content
            assertEquals(o["name"]!!.jsonPrimitive.content, input, PhoneNumbers.remove(input))
        }
    }

    /** An exact case: the output equals the expected text byte for byte. */
    @Test fun everyExactCaseGivesItsExpectedText() {
        for (o in cases("exact", 1)) {
            assertEquals(o["name"]!!.jsonPrimitive.content, o["output"]!!.jsonPrimitive.content, PhoneNumbers.remove(o["input"]!!.jsonPrimitive.content))
        }
    }

    /** Scrubbing twice is scrubbing once: for every case that runs here, scrubbing its output again changes nothing. */
    @Test fun scrubbingAnOutputAgainChangesNothing() {
        var checked = 0
        for (key in kinds) for (o in vectors[key]!!.jsonArray.map { it.jsonObject }.filterNot(::pendingHere)) {
            val out = PhoneNumbers.remove(o["input"]!!.jsonPrimitive.content)
            assertEquals("${o["name"]!!.jsonPrimitive.content}: scrubbed again", out, PhoneNumbers.remove(out))
            checked++
        }
        assertTrue("cases checked: $checked", checked >= 100)
    }

    private fun pendingHere(c: JsonObject) = c["pendingOn"]?.jsonArray?.any { it.jsonPrimitive.content == "android" } == true

    private val kinds = listOf("mustRemove", "mustKeep", "exact")

    /** Whether this app passes case [o] of kind [key], by the same checks the tests above make. */
    private fun passes(key: String, o: JsonObject): Boolean {
        val input = o["input"]!!.jsonPrimitive.content
        val out = PhoneNumbers.remove(input)
        return when (key) {
            "mustRemove" -> !out.contains(o["number"]!!.jsonPrimitive.content) && !out.codePoints().anyMatch { isNumber(it) } &&
                o["forbidden"]!!.jsonArray.none { out.contains(it.jsonPrimitive.content) } &&
                o["keep"]!!.jsonArray.all { out.contains(it.jsonPrimitive.content) }
            "mustKeep" -> out == input
            "exact" -> out == o["output"]!!.jsonPrimitive.content
            else -> error("no such kind: $key")
        }
    }

    /** The check below is only as good as [passes]: it agrees with every case that runs here. */
    @Test fun thePassCheckAgreesWithEveryCaseThatRuns() {
        for (key in kinds) for (o in vectors[key]!!.jsonArray.map { it.jsonObject }.filterNot(::pendingHere)) {
            assertTrue("${o["name"]!!.jsonPrimitive.content}: passes", passes(key, o))
        }
    }

    /** A case marked pending on android must still fail here; one that passes is ready to have android taken off it. */
    @Test fun everyCasePendingOnAndroidStillFailsHere() {
        for (key in kinds) for (o in vectors[key]!!.jsonArray.map { it.jsonObject }.filter(::pendingHere)) {
            assertFalse("un-pend ${o["name"]!!.jsonPrimitive.content}: it passes on android", passes(key, o))
        }
    }
}
