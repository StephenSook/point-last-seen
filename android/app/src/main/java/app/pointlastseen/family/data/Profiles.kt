package app.pointlastseen.family.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class Place(val label: String)

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
    val mobilityAids: String = "",
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
    val previousAddresses: List<Place> = emptyList(),
    val placesFrequented: List<Place> = emptyList(),
    val pastWandering: List<String> = emptyList(),
    val nearbyWater: String = "",
    val vehicle: String = "",
)

object Profiles {
    val FLAGS = listOf(
        "mayNotRespond", "likelyToHide", "afraidOfUniforms", "sensitiveToTouch", "sensitiveToLight",
        "likelyToFight", "seizures", "hallucinationsOrDelusions", "lookingForHome", "gaitUnsteady",
        "freezing", "fallRisk", "softVoice", "slowToRespond", "fluctuates", "medicationSensitivity",
        "carriesMedicalAlertCard", "medicationTimingMatters",
    )
    val DEMENTIA_TYPES = listOf("alzheimers", "lewy_body", "vascular", "frontotemporal", "mixed", "other", "unknown")
    const val FREE_TEXT_MAX = 200
    const val PHOTO_WARN_DAYS = 60L
    const val UPDATE_PROMPT_DAYS = 183L

    private fun cap(s: String) = s.trim().take(FREE_TEXT_MAX)

    /** profile/shared: readable by every member and carried in the pack. */
    fun forSearchers(p: SubjectProfile): Map<String, Any?> {
        val m = linkedMapOf<String, Any?>(
            "answersTo" to p.answersTo.trim(),
            "nickname" to p.nickname.trim(),
            "ageYears" to p.ageYears,
            "gender" to p.gender.trim(),
            "appearance" to cap(p.appearance),
            "heightFt" to p.heightFt,
            "heightIn" to p.heightIn,
            "weightLb" to p.weightLb,
            "hair" to p.hair.trim(),
            "eyeColor" to p.eyeColor.trim(),
            "primaryLanguage" to p.primaryLanguage.trim(),
            "clothingLastWorn" to cap(p.clothingLastWorn),
            "mobilityAids" to p.mobilityAids.trim(),
            "flags" to FLAGS.associateWith { it in p.flags },
            "triggersToAvoid" to cap(p.triggersToAvoid),
            "bestApproach" to cap(p.bestApproach),
            "uniqueDescription" to cap(p.uniqueDescription),
            "photoTakenOn" to p.photoTakenOn?.toString(),
        )
        if (p.shareDementiaType && p.dementiaType in DEMENTIA_TYPES) m["dementiaType"] = p.dementiaType
        return m
    }

    /** profile/command: command and family only, never in a pack. */
    fun forCommand(p: SubjectProfile): Map<String, Any?> = linkedMapOf(
        "previousAddresses" to p.previousAddresses.map { mapOf("label" to cap(it.label)) },
        "placesFrequented" to p.placesFrequented.map { mapOf("label" to cap(it.label)) },
        "pastWandering" to p.pastWandering.map { mapOf("foundWhere" to cap(it)) },
        "nearbyWater" to cap(p.nearbyWater),
        "vehicle" to cap(p.vehicle),
    )

    /** "photo_old" after 60 days, "profile_stale" after 183, "clock_changed" after a clock change. */
    fun warnings(p: SubjectProfile, nowMs: Long, zone: ZoneId): List<String> {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val out = mutableListOf<String>()
        val photo = p.photoTakenOn
        if (photo != null && ChronoUnit.DAYS.between(photo, today) > PHOTO_WARN_DAYS) out += "photo_old"
        val updated = p.profileUpdatedOn
        if (updated == null || ChronoUnit.DAYS.between(updated, today) > UPDATE_PROMPT_DAYS) out += "profile_stale"
        if (updated != null && clockChangedSince(updated, nowMs, zone)) out += "clock_changed"
        return out
    }

    private fun clockChangedSince(updated: LocalDate, nowMs: Long, zone: ZoneId): Boolean {
        val from = updated.atStartOfDay(zone).toInstant()
        val next = zone.rules.nextTransition(from) ?: return false
        return next.instant.toEpochMilli() <= nowMs
    }
}
