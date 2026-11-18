package app.pointlastseen.family.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class LatLon(val lat: Double, val lon: Double) {
    fun toMap(): Map<String, Any> = mapOf("lat" to lat, "lon" to lon)
}

data class PlaceEntry(val label: String, val position: LatLon?) {
    fun toMap(): Map<String, Any?> = mapOf("label" to label, "position" to position?.toMap())
}

data class WanderingEntry(val foundWhere: String, val position: LatLon?) {
    fun toMap(): Map<String, Any?> = mapOf("foundWhere" to foundWhere, "position" to position?.toMap())
}

data class Vehicle(val involved: Boolean, val description: String) {
    fun toMap(): Map<String, Any> = mapOf("involved" to involved, "description" to description)
}

/**
 * The full profile, kept on the family phone (spec section 13.2). After "She's gone"
 * the shared fields go to profile/shared and the history fields to profile/command.
 * Medication details, the birthdate and the special concern never leave the phone.
 */
data class SubjectProfile(
    val answersTo: String = "",
    val nickname: String = "",
    val birthdate: LocalDate? = null,
    val ageYears: Int? = null,
    val gender: String = "",
    val appearance: String = "",
    val heightFt: Int? = null,
    val heightIn: Int? = null,
    val weightLb: Int? = null,
    val hair: String = "",
    val eyeColor: String = "",
    val primaryLanguage: String = "",
    val clothingLastWorn: String = "",
    val mobilityAids: Set<String> = emptySet(),
    val dementiaType: String = "unknown",
    val shareDementiaType: Boolean = false,
    val flags: Set<String> = setOf("mayNotRespond"),
    val triggersToAvoid: String = "",
    val bestApproach: String = "",
    val uniqueDescription: String = "",
    val photoTakenOn: LocalDate? = null,
    val profileUpdatedOn: LocalDate? = null,
    val medications: String = "",
    val howMedicationAffectsActions: String = "",
    val specialConcern: String = "",
    val previousAddresses: List<PlaceEntry> = emptyList(),
    val placesFrequented: List<PlaceEntry> = emptyList(),
    val pastWandering: List<WanderingEntry> = emptyList(),
    val nearbyWater: String = "",
    val vehicle: Vehicle? = null,
)

/** profile/shared: readable by every member and carried in the pack. */
data class SharedProfile(
    val answersTo: String,
    val nickname: String,
    val ageYears: Int?,
    val gender: String,
    val appearance: String,
    val heightFt: Int?,
    val heightIn: Int?,
    val weightLb: Int?,
    val hair: String,
    val eyeColor: String,
    val primaryLanguage: String,
    val clothingLastWorn: String,
    val mobilityAids: List<String>,
    val dementiaType: String?,
    val flags: Map<String, Boolean>,
    val triggersToAvoid: String,
    val bestApproach: String,
    val uniqueDescription: String,
    val photoTakenOn: String?,
    val approachNoteIds: List<String>,
) {
    fun toMap(): Map<String, Any?> = linkedMapOf(
        "answersTo" to answersTo, "nickname" to nickname, "ageYears" to ageYears, "gender" to gender,
        "appearance" to appearance, "heightFt" to heightFt, "heightIn" to heightIn, "weightLb" to weightLb,
        "hair" to hair, "eyeColor" to eyeColor, "primaryLanguage" to primaryLanguage,
        "clothingLastWorn" to clothingLastWorn, "mobilityAids" to mobilityAids, "dementiaType" to dementiaType,
        "flags" to flags, "triggersToAvoid" to triggersToAvoid, "bestApproach" to bestApproach,
        "uniqueDescription" to uniqueDescription, "photoTakenOn" to photoTakenOn, "approachNoteIds" to approachNoteIds,
    )
}

/** profile/command: command and family only, never in a pack. */
data class CommandProfile(
    val previousAddresses: List<PlaceEntry>,
    val placesFrequented: List<PlaceEntry>,
    val pastWandering: List<WanderingEntry>,
    val nearbyWater: String,
    val vehicle: Vehicle?,
) {
    fun toMap(): Map<String, Any?> = linkedMapOf(
        "previousAddresses" to previousAddresses.map { it.toMap() },
        "placesFrequented" to placesFrequented.map { it.toMap() },
        "pastWandering" to pastWandering.map { it.toMap() },
        "nearbyWater" to nearbyWater,
        "vehicle" to vehicle?.toMap(),
    )
}

object Profiles {
    val FLAGS = listOf(
        "mayNotRespond", "likelyToHide", "afraidOfUniforms", "sensitiveToTouch", "sensitiveToLight",
        "likelyToFight", "seizures", "hallucinationsOrDelusions", "lookingForHome", "gaitUnsteady",
        "freezing", "fallRisk", "softVoice", "slowToRespond", "fluctuates", "medicationSensitivity",
        "carriesMedicalAlertCard", "medicationTimingMatters",
    )
    val DEMENTIA_TYPES = listOf("alzheimers", "lewy_body", "vascular", "frontotemporal", "mixed", "other", "unknown")
    val MOBILITY_AIDS = listOf("cane", "walker", "wheelchair", "other")
    const val PHOTO_WARN_DAYS = 60L
    const val UPDATE_PROMPT_DAYS = 183L

    private fun cap(s: String, n: Int) = s.trim().take(n)
    private fun inRange(v: Int?, r: IntRange) = v?.takeIf { it in r }

    private fun sharedDementiaType(p: SubjectProfile) =
        p.dementiaType.takeIf { p.shareDementiaType && it in DEMENTIA_TYPES }

    fun forSearchers(p: SubjectProfile): SharedProfile = SharedProfile(
        answersTo = cap(p.answersTo, 60),
        nickname = cap(p.nickname, 60),
        ageYears = inRange(p.ageYears, 18..120),
        gender = cap(p.gender, 40),
        appearance = cap(p.appearance, 200),
        heightFt = inRange(p.heightFt, 3..8),
        heightIn = inRange(p.heightIn, 0..11),
        weightLb = inRange(p.weightLb, 50..500),
        hair = cap(p.hair, 60),
        eyeColor = cap(p.eyeColor, 40),
        primaryLanguage = cap(p.primaryLanguage, 40),
        clothingLastWorn = cap(p.clothingLastWorn, 200),
        mobilityAids = MOBILITY_AIDS.filter { it in p.mobilityAids },
        dementiaType = sharedDementiaType(p),
        flags = FLAGS.associateWith { it in p.flags },
        triggersToAvoid = cap(p.triggersToAvoid, 200),
        bestApproach = cap(p.bestApproach, 200),
        uniqueDescription = cap(p.uniqueDescription, 200),
        photoTakenOn = p.photoTakenOn?.toString(),
        approachNoteIds = approachNoteIds(p),
    )

    fun forCommand(p: SubjectProfile): CommandProfile = CommandProfile(
        previousAddresses = p.previousAddresses.mapNotNull { e -> cap(e.label, 80).takeIf { it.isNotEmpty() }?.let { PlaceEntry(it, e.position) } },
        placesFrequented = p.placesFrequented.mapNotNull { e -> cap(e.label, 80).takeIf { it.isNotEmpty() }?.let { PlaceEntry(it, e.position) } },
        pastWandering = p.pastWandering.mapNotNull { e -> cap(e.foundWhere, 120).takeIf { it.isNotEmpty() }?.let { WanderingEntry(it, e.position) } },
        nearbyWater = cap(p.nearbyWater, 200),
        vehicle = p.vehicle?.let { Vehicle(it.involved, cap(it.description, 120)) },
    )

    /**
     * Approach note ids: "may_not_respond" and "approach_calm" first (plan Task 35a),
     * then the rest of the spec 13.3 table in order, each filtered by its "shown when"
     * rule. The dementia type counts only when the family shares it.
     */
    fun approachNoteIds(p: SubjectProfile): List<String> {
        val f = p.flags
        val ids = mutableListOf<String>()
        if ("mayNotRespond" in f) ids += "may_not_respond"
        ids += "approach_calm"
        if ("likelyToHide" in f) ids += "likely_to_hide"
        if ("afraidOfUniforms" in f) ids += "afraid_of_uniforms"
        if ("hallucinationsOrDelusions" in f || sharedDementiaType(p) == "lewy_body") ids += "validate_feelings"
        if ("lookingForHome" in f) ids += "looking_for_home"
        if ("gaitUnsteady" in f) ids += "gait_unsteady"
        if ("freezing" in f) ids += "freezing"
        if ("fallRisk" in f) ids += "fall_risk"
        if ("softVoice" in f || "slowToRespond" in f) ids += "soft_voice"
        if ("fluctuates" in f) ids += "fluctuates"
        if ("sensitiveToTouch" in f) ids += "sensitive_to_touch"
        if ("sensitiveToLight" in f) ids += "sensitive_to_light"
        if ("likelyToFight" in f) ids += "may_strike_out"
        if ("seizures" in f) ids += "seizures"
        if ("medicationSensitivity" in f || "carriesMedicalAlertCard" in f) ids += "medication_alert"
        if ("medicationTimingMatters" in f) ids += "medication_timing"
        if (p.primaryLanguage.isNotBlank()) ids += "language"
        if (p.triggersToAvoid.isNotBlank()) ids += "triggers"
        if (p.bestApproach.isNotBlank()) ids += "best_approach"
        if (p.uniqueDescription.isNotBlank()) ids += "unique"
        return ids
    }

    /**
     * "I remembered something" becomes a profile edit: a place, an old address or a
     * past wandering spot joins its command-only list; clothing replaces clothingLastWorn.
     */
    fun applyNote(p: SubjectProfile, r: app.pointlastseen.family.ai.FamilyNoteReading): SubjectProfile {
        // The single write point for notes: the model's label, an edited label and a
        // by-hand label (the raw note) all pass through phone-number removal here.
        val label = app.pointlastseen.family.core.PhoneNumbers.remove(r.label).trim()
        fun same(a: String) = a.trim().equals(label, ignoreCase = true)
        return when (r.kind) {
            "place" -> if (p.placesFrequented.any { same(it.label) }) p else p.copy(placesFrequented = p.placesFrequented + PlaceEntry(label, null))
            "address" -> if (p.previousAddresses.any { same(it.label) }) p else p.copy(previousAddresses = p.previousAddresses + PlaceEntry(label, null))
            "wandering" -> if (p.pastWandering.any { same(it.foundWhere) }) p else p.copy(pastWandering = p.pastWandering + WanderingEntry(label, null))
            "clothing" -> p.copy(clothingLastWorn = label)
            else -> p
        }
    }

    /** "photo_old" after 60 days, "profile_stale" after 183, "clock_changed" after a clock change. */
    fun warnings(p: SubjectProfile, nowMs: Long, zone: ZoneId): List<String> {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val out = mutableListOf<String>()
        val photo = p.photoTakenOn
        if (photo != null && ChronoUnit.DAYS.between(photo, today) > PHOTO_WARN_DAYS) out += "photo_old"
        val updated = p.profileUpdatedOn
        // A profile never saved is new, not stale: the prompt starts after the first save.
        if (updated != null && ChronoUnit.DAYS.between(updated, today) > UPDATE_PROMPT_DAYS) out += "profile_stale"
        if (updated != null && clockChangedSince(updated, nowMs, zone)) out += "clock_changed"
        return out
    }

    private fun clockChangedSince(updated: LocalDate, nowMs: Long, zone: ZoneId): Boolean {
        val from = updated.atStartOfDay(zone).toInstant()
        val next = zone.rules.nextTransition(from) ?: return false
        return next.instant.toEpochMilli() <= nowMs
    }
}
