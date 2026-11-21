package app.pointlastseen.family.data

/**
 * A member's report about shared content: the team's task, the family's description, or one event
 * (incidents/{incidentId}/contentReports/{reportId}; shared/schemas/content-report.schema.json). The report id
 * is the document id. The family app writes none yet; it carries the type so the shared schema and this app
 * agree on the field names and allowed values.
 */
data class ContentReport(
    val authorUid: String,
    /** One of [ROLES]. */
    val role: String,
    /** One of [TARGETS]. */
    val target: String,
    /** The event id for an event, the plan document id for a task, null for the family's description. */
    val targetId: String?,
    /** One of [REASONS]. */
    val reason: String,
    /** At most [NOTE_MAX] characters, phone numbers removed before it is stored; absent when the reporter wrote none. */
    val note: String?,
    /** The server's time of the write, set by Firestore. */
    val createdAt: Any?,
) {
    companion object {
        val ROLES = listOf("searcher", "family")
        val TARGETS = listOf("task", "family_description", "event")
        val REASONS = listOf("abusive", "personal_information", "wrong_or_misleading", "other")
        const val NOTE_MAX = 500
    }
}
