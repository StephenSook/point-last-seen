package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.core.Compass
import app.pointlastseen.family.core.SightingCheck
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Turns a clip reading into the card's three facts, in the family's own clock. */
object ClipCards {
    private val CLOCK = DateTimeFormatter.ofPattern("HH:mm")

    /** The clip's wall-clock start: today at that time, or yesterday if that is still ahead. */
    fun startMs(minuteOfDay: Int, nowMs: Long, zone: ZoneId): Long {
        val now = Instant.ofEpochMilli(nowMs).atZone(zone)
        var at = now.with(LocalTime.of(minuteOfDay / 60, minuteOfDay % 60))
        if (at.isAfter(now)) at = at.minusDays(1)
        return at.toInstant().toEpochMilli()
    }

    fun card(r: ClipOutcome.Read, clipStartMs: Long, zone: ZoneId): ClipCard {
        val s = r.reading
        val last = Instant.ofEpochMilli(SightingCheck.lastSeenMs(clipStartMs, s.lastSeen)).atZone(zone)
        val parts = listOfNotNull(
            s.topColor.takeIf { it != "unknown" }?.let { "$it top" },
            s.bottomColor.takeIf { it != "unknown" }?.let { "$it bottom" },
        )
        return ClipCard(
            lastSeen = CLOCK.format(last),
            direction = r.bearingDeg?.let { Compass.word(it) },
            clothing = if (parts.isEmpty()) "clothing colors not clear" else parts.joinToString(", "),
            route = if (r.route?.path == "on_device") "Read on this phone" else "Read in the cloud",
            cached = r.cached,
            frameTime = s.keyFrame.time,
            box = s.keyFrame.box2d,
        )
    }
}
