package app.pointlastseen.family.core

data class CheckResult(
    val ok: Boolean,
    val reasons: List<String>,
    val cleaned: CameraSighting,
    val colorSuppressed: Boolean,
)

/** Code checks on a model's clip reading. A failure shows "Couldn't read" and changes nothing. */
object SightingCheck {
    const val MAX_CARRIED = 3
    private val MMSS = Regex("""^(\d{2}):([0-5]\d)$""")

    /** Seconds from "MM:SS", or null when malformed. */
    fun seconds(mmss: String): Int? {
        val m = MMSS.matchEntire(mmss.trim()) ?: return null
        return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
    }

    /** Wall-clock last-seen time: the confirmed clip start plus the lastSeen offset. */
    fun lastSeenMs(clipStartMs: Long, lastSeen: String): Long {
        val s = requireNotNull(seconds(lastSeen)) { "lastSeen is not MM:SS" }
        return clipStartMs + s * 1000L
    }

    fun check(s: CameraSighting, durationS: Int): CheckResult {
        val reasons = mutableListOf<String>()
        if (!s.personVisible) reasons += "no_person"
        val first = seconds(s.firstSeen)
        val last = seconds(s.lastSeen)
        val key = seconds(s.keyFrame.time)
        if (first == null) reasons += "first_seen_format"
        if (last == null) reasons += "last_seen_format"
        if (key == null) reasons += "key_frame_format"
        if (first != null && last != null && first > last) reasons += "first_after_last"
        if (last != null && last > durationS) reasons += "last_after_clip_end"
        if (first != null && first > durationS) reasons += "first_after_clip_end"
        if (key != null && key > durationS) reasons += "key_frame_after_clip_end"
        val b = s.keyFrame.box2d
        if (b.size != 4 || b.any { it !in 0..1000 } || b[0] >= b[2] || b[1] >= b[3]) reasons += "box"

        val suppress = s.lighting == Lighting.NIGHT_IR
        val cleaned = s.copy(
            topColor = if (suppress) "unknown" else Colors.normalize(s.topColor),
            bottomColor = if (suppress) "unknown" else Colors.normalize(s.bottomColor),
            carriedItems = s.carriedItems.take(MAX_CARRIED),
        )
        return CheckResult(ok = reasons.isEmpty(), reasons = reasons, cleaned = cleaned, colorSuppressed = suppress)
    }
}
