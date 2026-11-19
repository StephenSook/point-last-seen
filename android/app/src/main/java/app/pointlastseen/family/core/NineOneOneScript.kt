package app.pointlastseen.family.core

import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.SubjectProfile

/**
 * What the family reads to the 911 call-taker, built offline from the profile on this
 * phone (spec 6.4, promotion P-14). Nothing here is sent anywhere. In a drill the first
 * line is always "Training drill. Do not dial 911."
 */
object NineOneOneScript {
    const val DRILL_LINE = "Training drill. Do not dial 911."

    private val DEMENTIA = mapOf(
        "alzheimers" to "Alzheimer's", "lewy_body" to "Lewy body dementia", "vascular" to "vascular dementia",
        "frontotemporal" to "frontotemporal dementia", "mixed" to "mixed dementia", "other" to "dementia",
    )

    fun lines(p: SubjectProfile, mode: String?): List<String> {
        val drill = mode == "drill" || mode == "judge"
        val out = mutableListOf(if (drill) DRILL_LINE else "Tell the call-taker:")
        fun add(s: String?) { if (!s.isNullOrBlank()) out += s }
        // Someone with dementia may answer only to an older name, so every other name is read out.
        val name = p.answersTo.trim()
        val others = Profiles.otherNames(p.otherNames)
        val missing = "A person with dementia is missing."
        add(
            when {
                name.isNotEmpty() && others.isNotEmpty() -> "$missing Their name is $name (also called ${others.joinToString(", ")})."
                name.isNotEmpty() -> "$missing Their name is $name."
                others.isNotEmpty() -> "$missing They may answer to ${orList(others)}."
                else -> missing
            },
        )
        add(listOfNotNull(p.ageYears?.let { "Age $it" }, p.gender.takeIf { it.isNotBlank() }).joinToString(", ").ifBlank { null }?.let { "$it." })
        if (p.heightFt != null) add("Height ${p.heightFt} feet ${p.heightIn ?: 0} inches.")
        p.weightLb?.let { add("Weight about $it pounds.") }
        add(listOfNotNull(p.hair.takeIf { it.isNotBlank() }?.let { "$it hair" }, p.eyeColor.takeIf { it.isNotBlank() }?.let { "$it eyes" }).joinToString(", ").ifBlank { null }?.let { "${it.replaceFirstChar { c -> c.uppercase() }}." })
        if (p.appearance.isNotBlank()) add("Looks: ${p.appearance}.")
        if (p.clothingLastWorn.isNotBlank()) add("Last wearing: ${p.clothingLastWorn}.")
        if (p.mobilityAids.isNotEmpty()) add("Walks with: ${p.mobilityAids.sorted().joinToString(", ")}.")
        DEMENTIA[p.dementiaType]?.let { add("They have $it.") }
        if ("mayNotRespond" in p.flags) add("They may not answer when called by name.")
        if (p.primaryLanguage.isNotBlank()) add("Primary language: ${p.primaryLanguage}.")
        if (p.medications.isNotBlank()) add("Medicines: ${p.medications}.")
        if ("carriesMedicalAlertCard" in p.flags) add("They carry a medical alert card.")
        add("Last seen: (say the time and the place).")
        return out
    }

    private fun orList(xs: List<String>) = if (xs.size == 1) xs[0] else xs.dropLast(1).joinToString(", ") + " or " + xs.last()
}
