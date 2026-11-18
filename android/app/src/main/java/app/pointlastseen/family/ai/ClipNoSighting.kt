package app.pointlastseen.family.ai

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A clip reading that found no usable sighting (shared/schemas/clip-no-sighting.schema.json). It is
 * stored as the clip reading's `reading`, so the record is complete and cached for everyone: the
 * reasons are the shared camera check's codes, an unparseable reply, or a model error.
 */
data class ClipNoSighting(val reasons: List<String>, val status: String = STATUS) {
    init {
        require(status == STATUS) { "status must be $STATUS" }
        require(reasons.isNotEmpty() && reasons.size <= MAX_REASONS && reasons.all { it in REASONS }) { "reasons outside the schema: $reasons" }
    }

    fun toMap(): Map<String, Any?> = linkedMapOf("status" to status, "reasons" to reasons)

    fun toJson(): String = JsonObject(mapOf("status" to JsonPrimitive(status), "reasons" to JsonArray(reasons.map(::JsonPrimitive)))).toString()

    companion object {
        const val STATUS = "no_sighting"
        const val MAX_REASONS = 11
        val REASONS = listOf(
            "no_person", "first_seen_format", "last_seen_format", "key_frame_format", "first_after_last", "last_after_clip_end",
            "first_after_clip_end", "key_frame_after_clip_end", "box", "unreadable_reply", "model_error",
        )

        /** The check's reasons as a no-sighting (each once, in order). */
        fun of(reasons: List<String>): ClipNoSighting = ClipNoSighting(reasons.distinct())

        /** A stored reading that is a no-sighting, or null. */
        fun parse(json: String?): ClipNoSighting? = runCatching {
            val o = Json.parseToJsonElement(json ?: return null).jsonObject
            if (o.keys != setOf("status", "reasons")) return null
            ClipNoSighting(o.getValue("reasons").jsonArray.map { it.jsonPrimitive.content }, o.getValue("status").jsonPrimitive.content)
        }.getOrNull()
    }
}
