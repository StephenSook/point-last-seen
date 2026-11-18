package app.pointlastseen.family.ai

import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.ExitEdge
import app.pointlastseen.family.core.KeyFrame
import app.pointlastseen.family.core.Legibility
import app.pointlastseen.family.core.Lighting
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Reads the model's JSON into the closed CameraSighting schema; anything malformed is null. */
object CameraSightingJson {
    private val EDGES = ExitEdge.entries.map { it.wire }.toSet()

    fun parse(text: String?): CameraSighting? {
        if (text == null) return null
        return runCatching { fromObject(Json.parseToJsonElement(text).jsonObject) }.getOrNull()
    }

    private fun fromObject(o: JsonObject): CameraSighting? {
        fun str(k: String): String? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        fun edge(k: String): ExitEdge? = str(k)?.takeIf { it in EDGES }?.let { ExitEdge.fromWire(it) }
        val key = o["keyFrame"]?.jsonObject ?: return null
        val box = (key["box2d"] as? JsonArray)?.map { it.jsonPrimitive.intOrNull ?: return null } ?: return null
        val carried = (o["carriedItems"] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
        val lightingWire = str("lighting") ?: return null
        val lighting = Lighting.entries.firstOrNull { it.wire == lightingWire } ?: return null
        return CameraSighting(
            personVisible = (o["personVisible"] as? JsonPrimitive)?.booleanOrNull ?: return null,
            firstSeen = str("firstSeen") ?: return null,
            lastSeen = str("lastSeen") ?: return null,
            entryEdge = edge("entryEdge") ?: return null,
            exitEdge = edge("exitEdge") ?: return null,
            topColor = str("topColor") ?: "unknown",
            bottomColor = str("bottomColor") ?: "unknown",
            topType = str("topType") ?: "",
            footwear = str("footwear") ?: "",
            headwear = str("headwear") ?: "",
            carriedItems = carried,
            keyFrame = KeyFrame(str = key, box = box) ?: return null,
            lighting = lighting,
            legibility = Legibility.fromWire(str("legibility")) ?: return null,
            evidence = str("evidence") ?: "",
        )
    }

    @Suppress("FunctionName")
    private fun KeyFrame(str: JsonObject, box: List<Int>): KeyFrame? {
        val t = (str["time"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        return KeyFrame(time = t, box2d = box)
    }

    fun toJson(s: CameraSighting): String {
        val m = s.toMap()
        return Json.encodeToString(JsonObject.serializer(), toElement(m) as JsonObject)
    }

    private fun toElement(v: Any?): kotlinx.serialization.json.JsonElement = when (v) {
        null -> kotlinx.serialization.json.JsonNull
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to toElement(x) })
        is List<*> -> JsonArray(v.map { toElement(it) })
        else -> JsonPrimitive(v.toString())
    }
}
