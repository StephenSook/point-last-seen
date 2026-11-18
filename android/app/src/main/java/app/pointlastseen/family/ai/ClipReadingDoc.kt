package app.pointlastseen.family.ai

import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.data.RouteRecord
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * clipReadings/{sha256} (spec section 7, lane A ruling on review I9): a consent record
 * created before the upload (reading and route null, createdAt the server's time,
 * expiresAt a timestamp for the TTL policy), then one completion with the reading
 * (an object) and the route.
 */
object ClipReadingDoc {
    /** The consent record, written before the upload with exactly the ruled keys. */
    fun consentRecord(d: StoredClipReading, timestamp: (Long) -> Any, serverTimestamp: Any): Map<String, Any?> = linkedMapOf(
        "sha256" to d.sha256,
        "storagePath" to d.storagePath,
        "durationS" to d.durationS,
        "clipStartMs" to d.clipStartMs,
        "clockConfirmed" to d.clockConfirmed,
        "cameraFacingDeg" to d.cameraFacingDeg,
        "reading" to null,
        "route" to null,
        "consent" to d.consent.toMap(),
        "expiresAt" to timestamp(d.expiresAtMs),
        "createdAt" to serverTimestamp,
        "createdByUid" to d.createdByUid,
    )

    /** The one completion update: only the reading (an object) and the route. */
    fun completion(readingJson: String, route: RouteRecord): Map<String, Any?> = linkedMapOf(
        "reading" to requireNotNull(CameraSightingJson.parse(readingJson)) { "reading is not a CameraSighting" }.toMap(),
        "route" to route.toMap(),
    )

    fun fromMap(m: Map<String, Any?>, toMs: (Any?) -> Long): StoredClipReading? = runCatching {
        StoredClipReading(
            sha256 = m["sha256"] as String,
            storagePath = m["storagePath"] as String,
            durationS = (m["durationS"] as Number).toInt(),
            clipStartMs = (m["clipStartMs"] as Number).toLong(),
            clockConfirmed = m["clockConfirmed"] as Boolean,
            cameraFacingDeg = (m["cameraFacingDeg"] as Number?)?.toInt(),
            readingJson = m["reading"]?.let { toJson(it).toString() },
            route = (m["route"] as Map<*, *>?)?.let { route(it) },
            consent = consent(m["sha256"] as String, m["consent"] as Map<*, *>),
            expiresAtMs = toMs(m["expiresAt"]),
            createdAtMs = toMs(m["createdAt"]),
            createdByUid = m["createdByUid"] as String,
        )
    }.getOrNull()

    private fun route(r: Map<*, *>) = RouteRecord(
        platform = r["platform"] as String, path = r["path"] as String, stage = r["stage"] as String,
        model = r["model"] as String, reason = r["reason"] as String,
        latencyMs = (r["latencyMs"] as Number).toLong(), sdkReported = r["sdkReported"] as Boolean,
        blocked = r["blocked"] as String?, decidedAtMs = (r["decidedAtMs"] as Number).toLong(),
    )

    private fun mark(v: Any?) = (v as Map<*, *>?)?.let { ConsentMark(it["byUid"] as String, (it["atMs"] as Number).toLong()) }

    private fun consent(sha256: String, c: Map<*, *>) = ClipConsent(sha256, mark(c["personInClip"]), mark(c["footageOwner"]), mark(c["cloudProcessing"]), mark(c["publicUse"]))

    private fun toJson(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is String -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to toJson(x) })
        is List<*> -> JsonArray(v.map { toJson(it) })
        else -> JsonPrimitive(v.toString())
    }
}
