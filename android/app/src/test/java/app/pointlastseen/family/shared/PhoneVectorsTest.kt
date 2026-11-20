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
            assertFalse("$name: no digit is left: $out", out.any { it in '0'..'9' })
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
}
