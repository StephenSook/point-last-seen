package app.pointlastseen.family.ai

import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.data.RouteRecord
import org.junit.Assert.assertEquals
import org.junit.Test

class ClipReadingDocTest {
    private val json = """{"personVisible":true,"firstSeen":"00:03","lastSeen":"00:12","entryEdge":"right","exitEdge":"left","topColor":"blue","bottomColor":"black","topType":"coat","footwear":"sneakers","headwear":"none","carriedItems":["bag"],"keyFrame":{"time":"00:05","box2d":[100,200,900,500]},"lighting":"day","legibility":"clear","evidence":"walks out left"}"""
    private val doc = StoredClipReading(
        sha256 = "ab".repeat(32), storagePath = "clips/inc-1/x.mp4", durationS = 30, clipStartMs = 500L,
        clockConfirmed = true, cameraFacingDeg = 90, readingJson = json,
        route = RouteRecord("android", "cloud", "sdk", "gemini-3.5-flash-lite", "sdk_only_in_cloud", 900, true, null, 1_000L),
        consent = ClipConsent(ConsentMark("u", 1L), ConsentMark("u", 2L), ConsentMark("u", 3L), null),
        expiresAtMs = 9_000L, createdAtMs = 1_000L,
    )

    @Test fun theDocumentHasTheSpecFields() {
        assertEquals(
            setOf("sha256", "storagePath", "durationS", "clipStartMs", "clockConfirmed", "cameraFacingDeg", "reading", "route", "consent", "expiresAt", "createdAt"),
            ClipReadingDoc.toMap(doc) { it }.keys,
        )
    }

    @Test fun theReadingIsStoredAsAnObjectNotAString() {
        val reading = ClipReadingDoc.toMap(doc) { it }["reading"]
        assertEquals(true, (reading as Map<*, *>)["personVisible"])
    }

    @Test fun aStoredDocumentReadsBackTheSame() {
        val back = ClipReadingDoc.fromMap(ClipReadingDoc.toMap(doc) { it }) { (it as Long) }
        assertEquals(doc.copy(readingJson = CameraSightingJson.toJson(CameraSightingJson.parse(json)!!)), back)
    }

    @Test fun expiryUsesTheTimestampConverterForTheTtlPolicy() {
        val m = ClipReadingDoc.toMap(doc) { "TS($it)" }
        assertEquals("TS(9000)", m["expiresAt"])
        assertEquals("TS(1000)", m["createdAt"])
    }
}
