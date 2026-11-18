package app.pointlastseen.family.shared

import app.pointlastseen.family.data.EventIds
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test

class IdVectorsTest {
    @Test fun everySharedEventIdVectorMatches() {
        val cases = SharedFiles.json("shared/test-vectors/search.json")["ids"]!!.jsonArray
            .map { it.jsonObject }
            .filter { it["input"]!!.jsonObject["fn"]!!.jsonPrimitive.content == "eventId" }
        assertEquals("eventId vectors walked", 7, cases.size)
        for (c in cases) {
            val i = c["input"]!!.jsonObject
            val got = EventIds.eventId(i["incidentId"]!!.jsonPrimitive.content, i["deviceId"]!!.jsonPrimitive.content, i["seq"]!!.jsonPrimitive.long)
            assertEquals(c["name"]!!.jsonPrimitive.content, c["expected"]!!.jsonObject["eventId"]!!.jsonPrimitive.content, got)
        }
    }
}
