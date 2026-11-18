package app.pointlastseen.family.core

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
        val name = listOf(p.answersTo, p.nickname.takeIf { it.isNotBlank() }?.let { "(also called $it)" }).filter { !it.isNullOrBlank() }.joinToString(" ")
        add(if (name.isNotBlank()) "A person with dementia is missing. Their name is $name." else "A person with dementia is missing.")
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
}
