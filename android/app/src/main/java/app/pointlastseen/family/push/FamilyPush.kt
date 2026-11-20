package app.pointlastseen.family.push

/** What a family push may say: the search lead has a question, or a neutral search state. Never an outcome. */
sealed interface FamilyNotice {
    val incidentId: String
    data class Question(override val incidentId: String) : FamilyNotice
    data class Searching(override val incidentId: String) : FamilyNotice
    data class Paused(override val incidentId: String) : FamilyNotice
}

/**
 * Pushes on the family topic carry data { kind, incidentId } and no text. Any installation can subscribe
 * to a topic, so the app never reads a question id from a push: it lists the incident's questions on the
 * server and opens the newest unanswered one.
 */
object FamilyPush {
    /** The push data a tapped notice carries into the app. */
    val EXTRA_KEYS = listOf("kind", "incidentId")

    /** A family notice, or null for any other kind (there is no outcome kind) or a malformed push. */
    fun parse(data: Map<String, String>): FamilyNotice? {
        val incident = data["incidentId"]?.takeIf { it.isNotEmpty() } ?: return null
        return when (data["kind"]) {
            "question" -> FamilyNotice.Question(incident)
            "searching" -> FamilyNotice.Searching(incident)
            "paused" -> FamilyNotice.Paused(incident)
            else -> null
        }
    }

    /** Whether the app may show [n] itself: only for the search this phone is in now, never a former one. */
    fun isForCurrentSearch(n: FamilyNotice, currentIncident: String?): Boolean = currentIncident != null && n.incidentId == currentIncident

    /** The fixed words for each notice, whatever text a push carries. */
    fun body(n: FamilyNotice): String = when (n) {
        is FamilyNotice.Question -> "The search lead has a question."
        is FamilyNotice.Searching -> "Teams are searching now."
        is FamilyNotice.Paused -> "The search is paused. The search lead will call you."
    }
}
