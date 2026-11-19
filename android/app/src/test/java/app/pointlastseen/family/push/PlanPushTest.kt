package app.pointlastseen.family.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlanPushTest {
    @Test fun aTeamsTopicIsPlsIncidentTeam() {
        assertEquals("pls-drill-dev-1-T1", PlanPush.topic("drill-dev-1", "T1"))
    }

    /** FCM topic names take only letters, digits and - _ . ~ %; anything else is refused, not sent. */
    @Test fun aNameFcmCannotTakeHasNoTopic() {
        assertNull(PlanPush.topic("drill dev", "T1"))
        assertNull(PlanPush.topic("drill-dev-1", "T/1"))
        assertNull(PlanPush.topic("", "T1"))
    }

    @Test fun aPlanPushCarriesTheIncidentTheTeamAndTheVersion() {
        assertEquals(
            PlanPushData("drill-dev-1", "T1", "7"),
            PlanPush.parse(mapOf("incidentId" to "drill-dev-1", "teamId" to "T1", "planVersion" to "7")),
        )
    }

    @Test fun aPushMissingAFieldIsNotAPlanPush() {
        assertNull(PlanPush.parse(mapOf("incidentId" to "drill-dev-1", "teamId" to "T1")))
        assertNull(PlanPush.parse(mapOf("incidentId" to "", "teamId" to "T1", "planVersion" to "7")))
        assertNull(PlanPush.parse(emptyMap()))
    }
}
