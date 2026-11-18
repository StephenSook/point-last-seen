package app.pointlastseen.family.core

/** Frame edges a person can enter or leave by (spec section 12.1). */
enum class ExitEdge(val wire: String) {
    LEFT("left"),
    RIGHT("right"),
    TOP("top"),
    BOTTOM("bottom"),
    TOWARD_CAMERA("toward_camera"),
    AWAY_FROM_CAMERA("away_from_camera"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(s: String?): ExitEdge = entries.firstOrNull { it.wire == s } ?: UNKNOWN
    }
}

/** Travel bearing from the camera's facing plus the exit edge. */
object Bearing {
    /**
     * Offsets from the spec table: left -90, right +90, away 0, toward +180.
     * Top, bottom, unknown, or no facing give no bearing.
     */
    fun fromExit(facingDeg: Int?, exitEdge: ExitEdge): Int? {
        if (facingDeg == null) return null
        val offset = when (exitEdge) {
            ExitEdge.LEFT -> -90
            ExitEdge.RIGHT -> 90
            ExitEdge.AWAY_FROM_CAMERA -> 0
            ExitEdge.TOWARD_CAMERA -> 180
            ExitEdge.TOP, ExitEdge.BOTTOM, ExitEdge.UNKNOWN -> return null
        }
        return Math.floorMod(facingDeg + offset, 360)
    }
}

/** Compass words for the eight facings the family can pick, and for a travel bearing. */
object Compass {
    val FACINGS: List<Pair<String, Int>> = listOf(
        "north" to 0, "northeast" to 45, "east" to 90, "southeast" to 135,
        "south" to 180, "southwest" to 225, "west" to 270, "northwest" to 315,
    )

    fun word(deg: Int): String = FACINGS[Math.floorMod(Math.round(deg / 45.0).toInt(), 8)].first
}
