package app.pointlastseen.family.push

/** What a family push may say: the search lead has a question, or a neutral search state. Never an outcome. */
sealed interface FamilyNotice {
    val incidentId: String
    data class Question(override val incidentId: String, val questionId: String) : FamilyNotice
    data class Searching(override val incidentId: String) : FamilyNotice
    data class Paused(override val incidentId: String) : FamilyNotice
}

/**
 * Pushes on the family topic carry data { kind, incidentId, questionId (question only) } and no text.
 * The question itself is read from Firestore when the family opens it, never from the push.
 */
object FamilyPush {
    private val QUESTION_ID = Regex("[A-Za-z0-9_-]{1,40}")

    /** A family notice, or null for any other kind (there is no outcome kind) or a malformed push. */
    fun parse(data: Map<String, String>): FamilyNotice? {
        val incident = data["incidentId"]?.takeIf { it.isNotEmpty() } ?: return null
        return when (data["kind"]) {
            "question" -> data["questionId"]?.takeIf { QUESTION_ID.matches(it) }?.let { FamilyNotice.Question(incident, it) }
            "searching" -> FamilyNotice.Searching(incident)
            "paused" -> FamilyNotice.Paused(incident)
            else -> null
        }
    }

    /** The fixed words for each notice, whatever text a push carries. */
    fun body(n: FamilyNotice): String = when (n) {
        is FamilyNotice.Question -> "The search lead has a question."
        is FamilyNotice.Searching -> "Teams are searching now."
        is FamilyNotice.Paused -> "The search is paused. The search lead will call you."
    }
}
