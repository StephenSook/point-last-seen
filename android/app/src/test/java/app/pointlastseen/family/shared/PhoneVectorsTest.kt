package app.pointlastseen.family.shared

import app.pointlastseen.family.core.PhoneNumbers
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** shared/test-vectors/phone-numbers.json: the same phone-number cases every platform's scrubber must pass. */
class PhoneVectorsTest {
    private val vectors = SharedFiles.json("shared/test-vectors/phone-numbers.json")

    @Test fun everyMustRemoveCaseLosesItsNumberAndKeepsItsText() {
        val cases = vectors["mustRemove"]!!.jsonArray
        assertTrue("mustRemove cases walked: ${cases.size}", cases.size >= 7)
        for (c in cases) {
            val o = c.jsonObject
            val name = o["name"]!!.jsonPrimitive.content
            val out = PhoneNumbers.remove(o["input"]!!.jsonPrimitive.content)
            assertFalse("$name: the number is gone", out.contains(o["number"]!!.jsonPrimitive.content))
            assertFalse("$name: no digit is left: $out", out.any { it in '0'..'9' })
            for (f in o["forbidden"]!!.jsonArray) assertFalse("$name: no ${f.jsonPrimitive.content}", out.contains(f.jsonPrimitive.content))
            for (k in o["keep"]!!.jsonArray) assertTrue("$name: keeps ${k.jsonPrimitive.content}", out.contains(k.jsonPrimitive.content))
        }
    }

    @Test fun everyMustKeepCaseIsUnchanged() {
        val cases = vectors["mustKeep"]!!.jsonArray
        assertTrue("mustKeep cases walked: ${cases.size}", cases.size >= 5)
        for (c in cases) {
            val o = c.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            assertEquals(o["name"]!!.jsonPrimitive.content, input, PhoneNumbers.remove(input))
        }
    }
}
