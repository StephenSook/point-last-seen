package app.pointlastseen.family.data

import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.Colors
import app.pointlastseen.family.core.PhoneNumbers
import app.pointlastseen.family.core.SightingCheck

/** Who is writing, and the next sequence number for this device. */
class EventContext(
    val incidentId: String,
    val deviceId: String,
    val authorUid: String,
    val priorVersion: Long,
    val nowMs: Long,
    val nextSeq: () -> Long,
)

/** "Someone saw them": what the family heard, with no caller name or number field. */
data class FamilySightingInput(
    val observedAtMs: Long?,
    val position: Position?,
    val place: String,
    val direction: String,
    val topColor: String,
    val bottomColor: String,
    val footwear: String,
    val carried: String,
    val note: String,
)

data class ClipEvents(val cameraSighting: EventDoc, val confirmation: EventDoc)

object Events {
    const val ROLE = "family"
    val DIRECTIONS = listOf("n", "ne", "e", "se", "s", "sw", "w", "nw", "upstream", "downstream", "unknown")
    private const val MAX_TEXT = 2000

    private fun base(ctx: EventContext, type: String, reporter: String): EventDoc {
        val seq = ctx.nextSeq()
        return EventDoc(
            eventId = EventIds.eventId(ctx.incidentId, ctx.deviceId, seq),
            incidentId = ctx.incidentId, teamId = null, deviceId = ctx.deviceId, seq = seq,
            authorUid = ctx.authorUid, role = ROLE, type = type, reporter = reporter,
            clientTimeMs = ctx.nowMs, observedAtMs = null, position = null, positionSource = "none",
            rawText = null, inputMethod = "system", isTrainingInject = false, reading = null,
            effect = Effect.None("informational"), route = null, targetEventId = null, decision = null,
            planVersion = null, priorVersion = ctx.priorVersion,
        )
    }

    /**
     * A family sighting is logged with effect "needs_command": this phone has no
     * grid, so a person at command places it on the map and confirms it.
     */
    fun familySighting(input: FamilySightingInput, ctx: EventContext): EventDoc {
        val at = input.observedAtMs
        require(at != null && at > 0) { "A sighting needs a time." }
        require(at <= ctx.nowMs + 60_000L) { "A sighting time cannot be in the future." }
        val place = PhoneNumbers.remove(input.place.trim())
        val note = PhoneNumbers.remove(input.note.trim())
        val text = buildString {
            if (place.isNotEmpty()) append("Where: ").append(place)
            if (note.isNotEmpty()) {
                if (isNotEmpty()) append(". ")
                append(note)
            }
        }.take(MAX_TEXT)
        val reading = mapOf(
            "kind" to "sighting",
            "segmentIds" to emptyList<String>(),
            "method" to "unknown",
            "coverage" to null,
            "minutes" to null,
            "searchers" to null,
            "searchType" to "unknown",
            "detectionRangeM" to null,
            "item" to "",
            "feature" to "none",
            "direction" to if (input.direction in DIRECTIONS) input.direction else "unknown",
            "topColor" to Colors.normalize(input.topColor),
            "bottomColor" to Colors.normalize(input.bottomColor),
            "footwear" to PhoneNumbers.remove(input.footwear.trim()).take(40),
            "carried" to PhoneNumbers.remove(input.carried.trim()).take(40),
            "matchesProfile" to "unknown",
            "evidenceQuote" to "",
        )
        return base(ctx, "sighting", "family").copy(
            observedAtMs = at,
            position = input.position,
            positionSource = if (input.position != null) "gps" else "none",
            rawText = text.ifEmpty { null },
            inputMethod = "typed",
            reading = reading,
            effect = Effect.None("needs_command"),
            // Entered by hand, so no model ran: the hand-entry route, as the iPhone's pick list writes it.
            route = RouteRecord(
                platform = "android", path = "rules", stage = "picklist", model = "none", reason = "on_device_default",
                latencyMs = 0, sdkReported = false, blocked = null, decidedAtMs = ctx.nowMs,
            ),
        )
    }

    /**
     * A confirmed clip: the camera sighting (it shapes the prior only) and its confirmation.
     * The reading is a CameraSightingReading: the sighting plus the clip reference, so
     * command can find clipReadings/{clipSha256} and derive the bearing and start time.
     */
    fun confirmClip(
        sighting: CameraSighting,
        clipStartMs: Long,
        cameraPosition: Position?,
        route: RouteRecord?,
        ctx: EventContext,
        clipSha256: String,
        cameraFacingDeg: Int?,
        clockConfirmed: Boolean,
    ): ClipEvents {
        val cam = base(ctx, "camera_sighting", "camera").copy(
            observedAtMs = SightingCheck.lastSeenMs(clipStartMs, sighting.lastSeen),
            position = cameraPosition,
            positionSource = if (cameraPosition != null) "camera_pin" else "none",
            inputMethod = "clip",
            reading = CameraSightingReading(sighting, clipSha256, clipStartMs, clockConfirmed, cameraFacingDeg).toMap(),
            effect = Effect.None("incorporated_in_prior"),
            route = route,
        )
        val conf = base(ctx, "confirmation", "family").copy(
            inputMethod = "system",
            effect = Effect.None("informational"),
            targetEventId = cam.eventId,
            decision = "confirmed",
        )
        return ClipEvents(cam, conf)
    }
}
