package app.pointlastseen.family.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate

/** The full profile as JSON, for this phone's private storage only. */
object ProfileCodec {
    private fun s(v: String) = JsonPrimitive(v)
    private fun n(v: Int?) = v?.let { JsonPrimitive(it) } ?: JsonNull
    private fun d(v: LocalDate?) = v?.let { JsonPrimitive(it.toString()) } ?: JsonNull
    private fun ll(p: LatLon?) = p?.let { JsonObject(mapOf("lat" to JsonPrimitive(it.lat), "lon" to JsonPrimitive(it.lon))) } ?: JsonNull
    private fun strs(v: Collection<String>) = JsonArray(v.map { JsonPrimitive(it) })

    fun encode(p: SubjectProfile): String = JsonObject(
        mapOf(
            "answersTo" to s(p.answersTo), "nickname" to s(p.nickname), "birthdate" to d(p.birthdate),
            "ageYears" to n(p.ageYears), "gender" to s(p.gender), "appearance" to s(p.appearance),
            "heightFt" to n(p.heightFt), "heightIn" to n(p.heightIn), "weightLb" to n(p.weightLb),
            "hair" to s(p.hair), "eyeColor" to s(p.eyeColor), "primaryLanguage" to s(p.primaryLanguage),
            "clothingLastWorn" to s(p.clothingLastWorn), "mobilityAids" to strs(p.mobilityAids),
            "dementiaType" to s(p.dementiaType), "shareDementiaType" to JsonPrimitive(p.shareDementiaType),
            "flags" to strs(p.flags), "triggersToAvoid" to s(p.triggersToAvoid), "bestApproach" to s(p.bestApproach),
            "uniqueDescription" to s(p.uniqueDescription), "photoTakenOn" to d(p.photoTakenOn),
            "profileUpdatedOn" to d(p.profileUpdatedOn), "medications" to s(p.medications),
            "howMedicationAffectsActions" to s(p.howMedicationAffectsActions), "specialConcern" to s(p.specialConcern),
            "previousAddresses" to JsonArray(p.previousAddresses.map { JsonObject(mapOf("label" to s(it.label), "position" to ll(it.position))) }),
            "placesFrequented" to JsonArray(p.placesFrequented.map { JsonObject(mapOf("label" to s(it.label), "position" to ll(it.position))) }),
            "pastWandering" to JsonArray(p.pastWandering.map { JsonObject(mapOf("foundWhere" to s(it.foundWhere), "position" to ll(it.position))) }),
            "nearbyWater" to s(p.nearbyWater),
            "vehicle" to (p.vehicle?.let { JsonObject(mapOf("involved" to JsonPrimitive(it.involved), "description" to s(it.description))) } ?: JsonNull),
        ),
    ).toString()

    fun decode(text: String): SubjectProfile {
        val o = Json.parseToJsonElement(text).jsonObject
        fun str(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
        fun int(k: String) = (o[k] as? JsonPrimitive)?.intOrNull
        fun date(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { LocalDate.parse(it) }
        fun list(k: String) = (o[k] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
        fun pos(e: JsonElement?) = (e as? JsonObject)?.let { p ->
            val lat = p["lat"]?.jsonPrimitive?.doubleOrNull
            val lon = p["lon"]?.jsonPrimitive?.doubleOrNull
            if (lat != null && lon != null) LatLon(lat, lon) else null
        }
        fun places(k: String) = (o[k] as? JsonArray)?.map { e ->
            val m = e.jsonObject
            PlaceEntry(m["label"]?.jsonPrimitive?.content ?: "", pos(m["position"]))
        } ?: emptyList()
        val defaults = SubjectProfile()
        return SubjectProfile(
            answersTo = str("answersTo"), nickname = str("nickname"), birthdate = date("birthdate"),
            ageYears = int("ageYears"), gender = str("gender"), appearance = str("appearance"),
            heightFt = int("heightFt"), heightIn = int("heightIn"), weightLb = int("weightLb"),
            hair = str("hair"), eyeColor = str("eyeColor"), primaryLanguage = str("primaryLanguage"),
            clothingLastWorn = str("clothingLastWorn"), mobilityAids = list("mobilityAids").toSet(),
            dementiaType = str("dementiaType").ifEmpty { defaults.dementiaType },
            shareDementiaType = (o["shareDementiaType"] as? JsonPrimitive)?.booleanOrNull ?: false,
            flags = if (o.containsKey("flags")) list("flags").toSet() else defaults.flags,
            triggersToAvoid = str("triggersToAvoid"), bestApproach = str("bestApproach"),
            uniqueDescription = str("uniqueDescription"), photoTakenOn = date("photoTakenOn"),
            profileUpdatedOn = date("profileUpdatedOn"), medications = str("medications"),
            howMedicationAffectsActions = str("howMedicationAffectsActions"), specialConcern = str("specialConcern"),
            previousAddresses = places("previousAddresses"), placesFrequented = places("placesFrequented"),
            pastWandering = (o["pastWandering"] as? JsonArray)?.map { e ->
                val m = e.jsonObject
                WanderingEntry(m["foundWhere"]?.jsonPrimitive?.content ?: "", pos(m["position"]))
            } ?: emptyList(),
            nearbyWater = str("nearbyWater"),
            vehicle = (o["vehicle"] as? JsonObject)?.let {
                Vehicle(it["involved"]?.jsonPrimitive?.booleanOrNull ?: false, it["description"]?.jsonPrimitive?.content ?: "")
            },
        )
    }
}

/** The profile lives on the family phone, in app-private storage (backups are off). */
class ProfileStore(private val store: KeyValueStore) {
    fun load(): SubjectProfile = store.get(KEY)?.let { runCatching { ProfileCodec.decode(it) }.getOrNull() } ?: SubjectProfile()

    fun save(p: SubjectProfile) = store.put(KEY, ProfileCodec.encode(p))

    companion object {
        private const val KEY = "profile"
    }
}
