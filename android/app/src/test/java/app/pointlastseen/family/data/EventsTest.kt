package app.pointlastseen.family.data

import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.ExitEdge
import app.pointlastseen.family.core.KeyFrame
import app.pointlastseen.family.core.Legibility
import app.pointlastseen.family.core.Lighting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventsTest {
    private var seq = 0L
    private fun ctx() = EventContext(
        incidentId = "inc-1",
        deviceId = "dev-1",
        authorUid = "uid-1",
        priorVersion = 2,
        nowMs = 1_000_000L,
        nextSeq = { ++seq },
    )

    private val input = FamilySightingInput(
        observedAtMs = 900_000L,
        position = null,
        place = "by the gas station on Elm",
        direction = "n",
        topColor = "blue",
        bottomColor = "black",
        footwear = "slippers",
        carried = "",
        note = "Caller at 404-555-0142 saw a woman in a blue coat",
    )

    @Test fun aFamilySightingIsLoggedForCommandToPlace() {
        val e = Events.familySighting(input, ctx())
        assertEquals("sighting", e.type)
        assertEquals("family", e.reporter)
        assertEquals("family", e.role)
        assertEquals(900_000L, e.observedAtMs)
        assertEquals(Effect.None("needs_command"), e.effect)
        assertEquals("none", e.positionSource)
        assertEquals("typed", e.inputMethod)
        assertEquals(EventIds.eventId("inc-1", "dev-1", 1), e.eventId)
        assertFalse(e.isTrainingInject)
    }

    /** A family sighting is entered by hand, so it carries the hand-entry route: no model ran (as the iPhone's pick list). */
    @Test fun aFamilySightingCarriesTheHandEntryRoute() {
        val e = Events.familySighting(input, ctx())
        assertEquals(
            RouteRecord(
                platform = "android", path = "rules", stage = "picklist", model = "none", reason = "on_device_default",
                latencyMs = 0, sdkReported = false, blocked = null, decidedAtMs = 1_000_000L,
            ),
            e.route,
        )
        assertEquals(9, (e.toMap()["route"] as Map<*, *>).size)
    }

    @Test fun phoneNumbersNeverReachTheStoredEvent() {
        val e = Events.familySighting(input, ctx())
        val stored = e.toMap().toString()
        assertFalse(stored.contains("404-555-0142"))
        assertFalse(stored.contains("4045550142"))
        assertTrue(e.rawText!!.contains("[number removed]"))
        assertTrue(e.rawText!!.contains("by the gas station on Elm"))
    }

    @Test fun aParenthesizedNumberNeverReachesTheStoredEvent() {
        val e = Events.familySighting(input.copy(note = "call +1 (404) 5550142", place = "Elm (404) 5550142"), ctx())
        val stored = e.toMap().toString()
        assertFalse(stored.contains("5550142"))
        assertTrue(e.rawText!!.contains("[number removed]"))
    }

    @Test fun aSightingWithNoTimeIsRefused() {
        val ex = runCatching { Events.familySighting(input.copy(observedAtMs = null), ctx()) }.exceptionOrNull()
        assertTrue(ex is IllegalArgumentException && ex.message!!.contains("time"))
    }

    @Test fun aSightingInTheFutureIsRefused() {
        val ex = runCatching { Events.familySighting(input.copy(observedAtMs = 2_000_000L), ctx()) }.exceptionOrNull()
        assertTrue(ex is IllegalArgumentException)
    }

    @Test fun aPhonePositionIsMarkedAsGps() {
        val e = Events.familySighting(input.copy(position = Position(33.7, -84.4, 12.0)), ctx())
        assertEquals("gps", e.positionSource)
        assertEquals(Position(33.7, -84.4, 12.0), e.position)
    }

    @Test fun theStoredMapCarriesExactlyTheEventDocKeys() {
        val keys = Events.familySighting(input, ctx()).toMap().keys
        assertEquals(EVENT_DOC_KEYS, keys)
    }

    @Test fun theWriterSetsTheServerTimeSentinel() {
        val e = Events.familySighting(input, ctx()).copy(serverTime = "SENTINEL")
        assertEquals("SENTINEL", e.toMap()["serverTime"])
        assertEquals(1, e.toMap()["schemaVersion"])
    }

    private val sighting = CameraSighting(
        personVisible = true, firstSeen = "00:03", lastSeen = "02:14",
        entryEdge = ExitEdge.RIGHT, exitEdge = ExitEdge.LEFT,
        topColor = "blue", bottomColor = "black", topType = "coat", footwear = "sneakers", headwear = "none",
        carriedItems = listOf(), keyFrame = KeyFrame("00:05", listOf(100, 200, 900, 500)),
        lighting = Lighting.DAY, legibility = Legibility.CLEAR, evidence = "walks out left",
    )
    private val route = RouteRecord(
        platform = "android", path = "cloud", stage = "sdk", model = "gemini-3.5-flash-lite",
        reason = "sdk_only_in_cloud", latencyMs = 1200, sdkReported = true, blocked = null, decidedAtMs = 999_000L,
    )

    @Test fun confirmingAClipWritesACameraSightingAndItsConfirmation() {
        val out = Events.confirmClip(sighting, clipStartMs = 1_000L, cameraPosition = Position(33.7, -84.4, 8.0), route = route, ctx = ctx(), clipSha256 = "ab".repeat(32), cameraFacingDeg = 90, clockConfirmed = true)
        val cam = out.cameraSighting
        assertEquals("camera_sighting", cam.type)
        assertEquals("camera", cam.reporter)
        assertEquals("clip", cam.inputMethod)
        assertEquals("camera_pin", cam.positionSource)
        assertEquals(1_000L + 134_000L, cam.observedAtMs)
        assertEquals(Effect.None("incorporated_in_prior"), cam.effect)
        assertEquals(route, cam.route)
        val conf = out.confirmation
        assertEquals("confirmation", conf.type)
        assertEquals(cam.eventId, conf.targetEventId)
        assertEquals("confirmed", conf.decision)
        assertEquals(Effect.None("informational"), conf.effect)
        assertNotEquals(cam.eventId, conf.eventId)
    }

    @Test fun theCameraSightingReadingWrapsTheSightingWithTheClipReference() {
        val r = Events.confirmClip(sighting, 1_000L, null, route, ctx(), clipSha256 = "ab".repeat(32), cameraFacingDeg = 90, clockConfirmed = true).cameraSighting.reading!!
        assertEquals(setOf("sighting", "clipSha256", "clipStartMs", "clockConfirmed", "cameraFacingDeg"), r.keys)
        assertEquals(sighting.toMap(), r["sighting"])
        assertEquals("ab".repeat(32), r["clipSha256"])
        assertEquals(1_000L, r["clipStartMs"])
        assertEquals(true, r["clockConfirmed"])
        assertEquals(90, r["cameraFacingDeg"])
    }

    @Test fun aClipWithNoCameraPositionHasNone() {
        val out = Events.confirmClip(sighting, 1_000L, null, route, ctx(), clipSha256 = "ab".repeat(32), cameraFacingDeg = null, clockConfirmed = false)
        assertEquals("none", out.cameraSighting.positionSource)
        assertNull(out.cameraSighting.position)
    }

    @Test fun effectsSerializeToTheSpecShape() {
        assertEquals(mapOf("kind" to "none", "why" to "needs_command"), Effect.None("needs_command").toMap())
    }

    companion object {
        val EVENT_DOC_KEYS = setOf(
            "eventId", "schemaVersion", "incidentId", "teamId", "deviceId", "seq", "authorUid", "role", "type",
            "reporter", "clientTimeMs", "serverTime", "observedAtMs", "position", "positionSource", "rawText",
            "inputMethod", "isTrainingInject", "reading", "effect", "route", "targetEventId", "decision",
            "planVersion", "priorVersion",
        )
    }
}
