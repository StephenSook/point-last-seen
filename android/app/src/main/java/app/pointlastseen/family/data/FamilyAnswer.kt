package app.pointlastseen.family.data

/**
 * The family's answer to the search lead's question: the one update a family member makes to
 * incidents/{id}/familyQuestions/{questionId}. The rules take exactly these fields, once.
 */
object FamilyAnswer {
    const val MAX = 500

    /** The update to send, or null for an empty or too long answer. */
    fun update(text: String, uid: String, serverTime: Any): Map<String, Any?>? {
        val answer = text.trim()
        if (answer.isEmpty() || answer.length > MAX) return null
        return linkedMapOf("answer" to answer, "answeredByUid" to uid, "answeredAt" to serverTime)
    }
}
