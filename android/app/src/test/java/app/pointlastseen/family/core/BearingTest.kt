package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BearingTest {
    @Test fun bearingMatchesTheSharedCases() {
        assertEquals(270, Bearing.fromExit(0, ExitEdge.LEFT))
        assertEquals(80, Bearing.fromExit(350, ExitEdge.RIGHT))
        assertNull(Bearing.fromExit(90, ExitEdge.UNKNOWN))
        assertNull(Bearing.fromExit(90, ExitEdge.TOP))
        assertNull(Bearing.fromExit(null, ExitEdge.LEFT))
    }

    @Test fun towardAndAwayFollowTheTable() {
        assertEquals(270, Bearing.fromExit(90, ExitEdge.TOWARD_CAMERA))
        assertEquals(90, Bearing.fromExit(90, ExitEdge.AWAY_FROM_CAMERA))
        assertNull(Bearing.fromExit(90, ExitEdge.BOTTOM))
    }

    @Test fun bearingsReadAsEightCompassWords() {
        assertEquals("north", Compass.word(0))
        assertEquals("north", Compass.word(350))
        assertEquals("northeast", Compass.word(45))
        assertEquals("east", Compass.word(80))
        assertEquals("west", Compass.word(270))
        assertEquals("northwest", Compass.word(330))
        assertEquals(listOf(0, 45, 90, 135, 180, 225, 270, 315), Compass.FACINGS.map { it.second })
    }

    @Test fun edgesParseFromTheirWireNames() {
        assertEquals(ExitEdge.TOWARD_CAMERA, ExitEdge.fromWire("toward_camera"))
        assertEquals(ExitEdge.UNKNOWN, ExitEdge.fromWire("sideways"))
    }
}
