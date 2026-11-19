package app.pointlastseen.family.push

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyTopicTest {
    private val calls = mutableListOf<String>()
    private val topic = FamilyTopic(subscribe = { calls += "sub $it" }, unsubscribe = { calls += "unsub $it" })

    @Test fun theFamilyTopicIsPlsIncidentFamily() {
        assertEquals("pls-drill-dev-1-family", PlanPush.familyTopic("drill-dev-1"))
    }

    @Test fun joiningSubscribesAndLeavingUnsubscribes() {
        topic.joined("drill-dev-1")
        topic.left("drill-dev-1")
        assertEquals(listOf("sub pls-drill-dev-1-family", "unsub pls-drill-dev-1-family"), calls)
    }

    @Test fun anIncidentIdFcmCannotTakeSubscribesToNothing() {
        topic.joined("drill dev")
        assertEquals(emptyList<String>(), calls)
    }
}
