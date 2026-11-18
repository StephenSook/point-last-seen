package app.pointlastseen.family.data

data class Position(val lat: Double, val lon: Double, val accuracyM: Double) {
    fun toMap(): Map<String, Any> = mapOf("lat" to lat, "lon" to lon, "accuracyM" to accuracyM)
}

/** The stored effect. This app only ever writes "none" effects; command places what the family sends. */
sealed class Effect {
    abstract fun toMap(): Map<String, Any?>

    data class None(val why: String) : Effect() {
        init {
            require(why in WHY) { "unknown effect reason $why" }
        }

        override fun toMap(): Map<String, Any?> = mapOf("kind" to "none", "why" to why)
    }

    companion object {
        val WHY = setOf("needs_command", "informational", "invalid", "sound_only", "outside_area", "incorporated_in_prior")
    }
}

/** Route record (spec section 9). On Android the source is SDK-reported. */
data class RouteRecord(
    val platform: String,
    val path: String,
    val stage: String,
    val model: String,
    val reason: String,
    val latencyMs: Long,
    val sdkReported: Boolean,
    val blocked: String?,
    val decidedAtMs: Long,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "platform" to platform, "path" to path, "stage" to stage, "model" to model, "reason" to reason,
        "latencyMs" to latencyMs, "sdkReported" to sdkReported, "blocked" to blocked, "decidedAtMs" to decidedAtMs,
    )
}

/** One append-only event (spec section 8). Created once, never changed. */
data class EventDoc(
    val eventId: String,
    val incidentId: String,
    val teamId: String?,
    val deviceId: String,
    val seq: Long,
    val authorUid: String,
    val role: String,
    val type: String,
    val reporter: String,
    val clientTimeMs: Long,
    val observedAtMs: Long?,
    val position: Position?,
    val positionSource: String,
    val rawText: String?,
    val inputMethod: String,
    val isTrainingInject: Boolean,
    val reading: Map<String, Any?>?,
    val effect: Effect,
    val route: RouteRecord?,
    val targetEventId: String?,
    val decision: String?,
    val planVersion: Long?,
    val priorVersion: Long,
) {
    /** The Firestore document. The writer passes the server timestamp sentinel. */
    fun toMap(serverTime: Any): Map<String, Any?> = mapOf(
        "eventId" to eventId,
        "schemaVersion" to SCHEMA_VERSION,
        "incidentId" to incidentId,
        "teamId" to teamId,
        "deviceId" to deviceId,
        "seq" to seq,
        "authorUid" to authorUid,
        "role" to role,
        "type" to type,
        "reporter" to reporter,
        "clientTimeMs" to clientTimeMs,
        "serverTime" to serverTime,
        "observedAtMs" to observedAtMs,
        "position" to position?.toMap(),
        "positionSource" to positionSource,
        "rawText" to rawText,
        "inputMethod" to inputMethod,
        "isTrainingInject" to isTrainingInject,
        "reading" to reading,
        "effect" to effect.toMap(),
        "route" to route?.toMap(),
        "targetEventId" to targetEventId,
        "decision" to decision,
        "planVersion" to planVersion,
        "priorVersion" to priorVersion,
    )

    companion object {
        const val SCHEMA_VERSION = 1
    }
}
