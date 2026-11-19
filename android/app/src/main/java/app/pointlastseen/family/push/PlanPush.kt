package app.pointlastseen.family.push

/** What a plan push carries: only ids, never a person, place or task. */
data class PlanPushData(val incidentId: String, val teamId: String, val planVersion: String)

/**
 * Command's plan pushes: when an approved plan changes a team's assignment, the server sends one
 * FCM message to the topic pls-{incidentId}-{teamId} with data { incidentId, teamId, planVersion }.
 */
object PlanPush {
    const val CHANNEL_ID = "assignments"

    private val INCIDENT_PART = Regex("[A-Za-z0-9._~%-]+")

    /** No "-" in a team id: pls-a-b-c could otherwise be incident a-b team c or incident a team b-c. */
    private val TEAM_PART = Regex("[A-Za-z0-9._~%]+")

    /**
     * The team's topic, or null when a part has a character FCM topic names, or a team id, cannot take.
     * A team named "family" gets none: that topic is the family's.
     */
    fun topic(incidentId: String, teamId: String): String? =
        if (INCIDENT_PART.matches(incidentId) && TEAM_PART.matches(teamId) && !teamId.equals(FAMILY, ignoreCase = true)) "pls-$incidentId-$teamId" else null

    private const val FAMILY = "family"

    /** The family's topic for an incident: neutral notices and the search lead's questions, never outcomes. */
    fun familyTopic(incidentId: String): String? = if (INCIDENT_PART.matches(incidentId)) "pls-$incidentId-$FAMILY" else null

    /** A plan push, or null when any of its three fields is missing or empty. */
    fun parse(data: Map<String, String>): PlanPushData? {
        val incident = data["incidentId"]?.takeIf { it.isNotEmpty() } ?: return null
        val team = data["teamId"]?.takeIf { it.isNotEmpty() } ?: return null
        val version = data["planVersion"]?.takeIf { it.isNotEmpty() } ?: return null
        return PlanPushData(incident, team, version)
    }
}
