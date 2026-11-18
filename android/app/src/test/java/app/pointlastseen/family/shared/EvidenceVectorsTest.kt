package app.pointlastseen.family.shared

import app.pointlastseen.family.core.EvidenceScreen
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenceVectorsTest {
    @Test fun everySharedEvidenceVectorMatches() {
        val terms = EvidenceScreen.parseTerms(SharedFiles.text("shared/constants/evidence-terms.json"))
        val screen = EvidenceScreen(terms)
        val cases = SharedFiles.json("shared/test-vectors/search.json")["evidence"]!!.jsonArray
        assertTrue("evidence vectors walked: ${cases.size}", cases.size >= 15)
        for (c in cases) {
            val o = c.jsonObject
            val text = o["input"]!!.jsonObject["text"]!!.jsonPrimitive.content
            assertEquals(o["name"]!!.jsonPrimitive.content, o["expected"]!!.jsonPrimitive.boolean, screen.isPossibleEvidence(text))
        }
    }
}
