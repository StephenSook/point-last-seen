package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.ExitEdge
import app.pointlastseen.family.core.KeyFrame
import app.pointlastseen.family.core.Legibility
import app.pointlastseen.family.core.Lighting
import app.pointlastseen.family.data.RouteRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class ClipCardsTest {
    private val zone = ZoneId.of("America/New_York")
    private fun ms(y: Int, mo: Int, d: Int, h: Int, mi: Int) = LocalDateTime.of(y, mo, d, h, mi).atZone(zone).toInstant().toEpochMilli()

    @Test fun aClipStartTimeIsTheMostRecentPastTimeOfDay() {
        val now = ms(2026, 11, 22, 15, 0)
        assertEquals(ms(2026, 11, 22, 14, 1), ClipCards.startMs(14 * 60 + 1, now, zone))
        assertEquals(ms(2026, 11, 21, 23, 50), ClipCards.startMs(23 * 60 + 50, ms(2026, 11, 22, 0, 30), zone))
    }

    private val s = CameraSighting(
        true, "00:03", "02:00", ExitEdge.RIGHT, ExitEdge.LEFT, "blue", "black", "coat", "sneakers", "none",
        emptyList(), KeyFrame("00:05", listOf(100, 200, 900, 500)), Lighting.DAY, Legibility.CLEAR, "",
    )
    private val route = RouteRecord("android", "cloud", "sdk", "m", "sdk_only_in_cloud", 900, true, null, 1)

    @Test fun theCardReadsTimeDirectionAndClothing() {
        val start = ms(2026, 11, 22, 14, 1)
        val c = ClipCards.card(ClipOutcome.Read("x", s, null, 270, route, cached = false), start, zone)
        assertEquals("14:03", c.lastSeen)
        assertEquals("west", c.direction)
        assertEquals("blue top, black bottom", c.clothing)
        assertEquals("Read in the cloud", c.route)
        assertEquals("00:05", c.frameTime)
        assertEquals(listOf(100, 200, 900, 500), c.box)
    }

    @Test fun noBearingAndUnknownColorsReadPlainly() {
        val c = ClipCards.card(ClipOutcome.Read("x", s.copy(topColor = "unknown", bottomColor = "unknown"), null, null, route, cached = true), 0L, zone)
        assertNull(c.direction)
        assertEquals("clothing colors not clear", c.clothing)
        assertEquals(true, c.cached)
    }
}
