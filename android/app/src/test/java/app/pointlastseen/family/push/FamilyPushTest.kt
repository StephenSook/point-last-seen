package app.pointlastseen.family.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FamilyPushTest {
    @Test fun aQuestionPushCarriesTheIncidentAndTheQuestionId() {
        assertEquals(FamilyNotice.Question("drill-dev-1", "q_7"), FamilyPush.parse(mapOf("kind" to "question", "incidentId" to "drill-dev-1", "questionId" to "q_7")))
    }

    @Test fun searchingAndPausedAreNoticesWithNoText() {
        assertEquals(FamilyNotice.Searching("drill-dev-1"), FamilyPush.parse(mapOf("kind" to "searching", "incidentId" to "drill-dev-1")))
        assertEquals(FamilyNotice.Paused("drill-dev-1"), FamilyPush.parse(mapOf("kind" to "paused", "incidentId" to "drill-dev-1")))
    }

    /** Only the three kinds exist: any other kind, an outcome above all, is never shown. */
    @Test fun anyOtherKindIsNotAFamilyNotice() {
        for (kind in listOf("found", "closed", "safe", "", "QUESTION")) {
            assertNull(kind, FamilyPush.parse(mapOf("kind" to kind, "incidentId" to "drill-dev-1", "questionId" to "q1")))
        }
    }

    @Test fun aQuestionPushWithABadOrMissingIdIsNotANotice() {
        assertNull(FamilyPush.parse(mapOf("kind" to "question", "incidentId" to "drill-dev-1")))
        assertNull(FamilyPush.parse(mapOf("kind" to "question", "incidentId" to "drill-dev-1", "questionId" to "has space")))
        assertNull(FamilyPush.parse(mapOf("kind" to "question", "incidentId" to "drill-dev-1", "questionId" to "q".repeat(41))))
        assertNull(FamilyPush.parse(mapOf("kind" to "searching", "incidentId" to "")))
    }

    @Test fun eachNoticeHasItsFixedWords() {
        assertEquals("The search lead has a question.", FamilyPush.body(FamilyNotice.Question("i", "q")))
        assertEquals("Teams are searching now.", FamilyPush.body(FamilyNotice.Searching("i")))
        assertEquals("The search is paused. The search lead will call you.", FamilyPush.body(FamilyNotice.Paused("i")))
    }

    /** The family's own topic is never a team's: no plan push goes to a team named "family". */
    @Test fun noTeamTopicIsTheFamilyTopic() {
        assertNull(PlanPush.topic("drill-dev-1", "family"))
        assertNull(PlanPush.topic("drill-dev-1", "Family"))
        assertEquals("pls-drill-dev-1-family", PlanPush.familyTopic("drill-dev-1"))
    }
}
