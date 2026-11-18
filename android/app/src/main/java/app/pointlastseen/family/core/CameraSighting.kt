package app.pointlastseen.family.core

enum class Lighting(val wire: String) {
    DAY("day"), NIGHT_IR("night_ir"), LOW_LIGHT("low_light"), UNKNOWN("unknown");

    companion object {
        fun fromWire(s: String?): Lighting = entries.firstOrNull { it.wire == s } ?: UNKNOWN
    }
}

enum class Legibility(val wire: String) {
    CLEAR("clear"), PARTIAL("partial"), POOR("poor");

    companion object {
        fun fromWire(s: String?): Legibility? = entries.firstOrNull { it.wire == s }
    }
}

/** A key frame: time "MM:SS" and box2d [yMin, xMin, yMax, xMax] on a 0 to 1000 scale. */
data class KeyFrame(val time: String, val box2d: List<Int>)

/** The closed schema a clip is read into (spec section 12.1). */
data class CameraSighting(
    val personVisible: Boolean,
    val firstSeen: String,
    val lastSeen: String,
    val entryEdge: ExitEdge,
    val exitEdge: ExitEdge,
    val topColor: String,
    val bottomColor: String,
    val topType: String,
    val footwear: String,
    val headwear: String,
    val carriedItems: List<String>,
    val keyFrame: KeyFrame,
    val lighting: Lighting,
    val legibility: Legibility,
    val evidence: String,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "personVisible" to personVisible,
        "firstSeen" to firstSeen,
        "lastSeen" to lastSeen,
        "entryEdge" to entryEdge.wire,
        "exitEdge" to exitEdge.wire,
        "topColor" to topColor,
        "bottomColor" to bottomColor,
        "topType" to topType,
        "footwear" to footwear,
        "headwear" to headwear,
        "carriedItems" to carriedItems,
        "keyFrame" to mapOf("time" to keyFrame.time, "box2d" to keyFrame.box2d),
        "lighting" to lighting.wire,
        "legibility" to legibility.wire,
        "evidence" to evidence,
    )
}

/** The closed color list. Anything else is read as "unknown". */
object Colors {
    val ALL: List<String> = listOf(
        "black", "white", "gray", "red", "orange", "yellow", "green", "blue",
        "purple", "pink", "brown", "tan", "unknown",
    )

    fun normalize(c: String?): String {
        val v = c?.trim()?.lowercase() ?: return "unknown"
        return if (v in ALL) v else "unknown"
    }
}
