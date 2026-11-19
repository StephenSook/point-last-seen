package app.pointlastseen.family.push

/** What a plan push carries: only ids, never a person, place or task. */
data class PlanPushData(val incidentId: String, val teamId: String, val planVersion: String)

/**
 * Command's plan pushes: when an approved plan changes a team's assignment, the server sends one
 * FCM message to the topic pls-{incidentId}-{teamId} with data { incidentId, teamId, planVersion }.
 */
object PlanPush {
    const val CHANNEL_ID = "assignments"

    private val TOPIC_PART = Regex("[A-Za-z0-9._~%-]+")

    /** The team's topic, or null when a part has a character FCM topic names cannot take. */
    fun topic(incidentId: String, teamId: String): String? =
        if (TOPIC_PART.matches(incidentId) && TOPIC_PART.matches(teamId)) "pls-$incidentId-$teamId" else null

    /** A plan push, or null when any of its three fields is missing or empty. */
    fun parse(data: Map<String, String>): PlanPushData? {
        val incident = data["incidentId"]?.takeIf { it.isNotEmpty() } ?: return null
        val team = data["teamId"]?.takeIf { it.isNotEmpty() } ?: return null
        val version = data["planVersion"]?.takeIf { it.isNotEmpty() } ?: return null
        return PlanPushData(incident, team, version)
    }
}
