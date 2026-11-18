package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SightingCheckTest {
    private val sighting = CameraSighting(
        personVisible = true,
        firstSeen = "00:03",
        lastSeen = "00:12",
        entryEdge = ExitEdge.RIGHT,
        exitEdge = ExitEdge.LEFT,
        topColor = "blue",
        bottomColor = "black",
        topType = "coat",
        footwear = "sneakers",
        headwear = "none",
        carriedItems = listOf("bag"),
        keyFrame = KeyFrame(time = "00:05", box2d = listOf(100, 200, 900, 500)),
        lighting = Lighting.DAY,
        legibility = Legibility.CLEAR,
        evidence = "a person in a blue coat walks out of the left edge",
    )

    @Test fun nightInfraredSuppressesColors() {
        val r = SightingCheck.check(sighting.copy(lighting = Lighting.NIGHT_IR, topColor = "blue"), 30)
        assertEquals("unknown", r.cleaned.topColor)
        assertEquals("unknown", r.cleaned.bottomColor)
        assertTrue(r.colorSuppressed)
        assertTrue(r.ok)
    }

    @Test fun impossibleTimesFail() {
        assertFalse(SightingCheck.check(sighting.copy(firstSeen = "00:20", lastSeen = "00:10"), 30).ok)
    }

    @Test fun lastSeenAfterTheClipEndsFails() {
        assertFalse(SightingCheck.check(sighting.copy(lastSeen = "01:10"), 30).ok)
    }

    @Test fun boxOutsideTheFrameFails() {
        val bad = sighting.copy(keyFrame = KeyFrame("00:05", listOf(0, 0, 1200, 500)))
        assertFalse(SightingCheck.check(bad, 30).ok)
        val inverted = sighting.copy(keyFrame = KeyFrame("00:05", listOf(800, 0, 100, 500)))
        assertFalse(SightingCheck.check(inverted, 30).ok)
        val short = sighting.copy(keyFrame = KeyFrame("00:05", listOf(1, 2, 3)))
        assertFalse(SightingCheck.check(short, 30).ok)
    }

    @Test fun keyFrameOutsideTheClipFails() {
        assertFalse(SightingCheck.check(sighting.copy(keyFrame = KeyFrame("00:40", listOf(100, 200, 900, 500))), 30).ok)
    }

    @Test fun malformedTimesFail() {
        assertFalse(SightingCheck.check(sighting.copy(firstSeen = "3s"), 30).ok)
        assertFalse(SightingCheck.check(sighting.copy(lastSeen = "00:75"), 30).ok)
    }

    @Test fun noPersonFails() {
        assertFalse(SightingCheck.check(sighting.copy(personVisible = false), 30).ok)
    }

    @Test fun colorsOutsideTheClosedListBecomeUnknown() {
        val r = SightingCheck.check(sighting.copy(topColor = "teal-ish"), 30)
        assertEquals("unknown", r.cleaned.topColor)
        assertFalse(r.colorSuppressed)
    }

    @Test fun moreThanThreeCarriedItemsAreTrimmed() {
        val r = SightingCheck.check(sighting.copy(carriedItems = listOf("a", "b", "c", "d")), 30)
        assertEquals(listOf("a", "b", "c"), r.cleaned.carriedItems)
    }

    @Test fun aGoodReadingPasses() {
        val r = SightingCheck.check(sighting, 30)
        assertTrue(r.reasons.toString(), r.ok)
        assertEquals(sighting, r.cleaned)
    }

    @Test fun lastSeenMsAddsTheOffset() {
        assertEquals(1_134_000L, SightingCheck.lastSeenMs(1_000_000L, "02:14"))
    }
}
