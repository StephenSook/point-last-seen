package app.pointlastseen.family.push

import app.pointlastseen.family.data.KeyValueStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyTopicTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    private val calls = mutableListOf<String>()
    private var unsubscribeFails = false
    private val store = MemoryStore()
    private val topic = FamilyTopic(
        subscribe = { calls += "sub $it" },
        unsubscribe = { calls += "unsub $it"; if (unsubscribeFails) throw IllegalStateException("offline") },
        pending = store,
    )

    @Test fun theFamilyTopicIsPlsIncidentFamily() {
        assertEquals("pls-drill-dev-1-family", PlanPush.familyTopic("drill-dev-1"))
    }

    @Test fun joiningSubscribesAndLeavingUnsubscribes(): Unit = runBlocking {
        topic.joined("drill-dev-1")
        assertTrue(topic.left("drill-dev-1"))
        assertEquals(listOf("sub pls-drill-dev-1-family", "unsub pls-drill-dev-1-family"), calls)
        assertEquals(emptyList<String>(), topic.pendingTopics())
    }

    @Test fun anIncidentIdFcmCannotTakeSubscribesToNothing() {
        topic.joined("drill dev")
        assertEquals(emptyList<String>(), calls)
    }

    /** An unsubscribe FCM has not confirmed stays recorded, survives a restart, and is tried again. */
    @Test fun anUnconfirmedUnsubscribeIsKeptAndTriedAgain(): Unit = runBlocking {
        unsubscribeFails = true
        assertFalse(topic.left("drill-dev-1"))
        assertEquals(listOf("pls-drill-dev-1-family"), topic.pendingTopics())
        val afterRestart = FamilyTopic(subscribe = {}, unsubscribe = { calls += "retry $it" }, pending = store)
        afterRestart.retryPending()
        assertEquals("retry pls-drill-dev-1-family", calls.last())
        assertEquals(emptyList<String>(), afterRestart.pendingTopics())
    }

    /** Leaving records the drop before anything waits, so a process death before it is sent still retries it. */
    @Test fun aDropIsRecordedBeforeItIsSent(): Unit = runBlocking {
        topic.leaving("drill-test-1")
        assertEquals(listOf("pls-drill-test-1-family"), topic.pendingTopics())
        assertEquals(emptyList<String>(), calls)
        val afterRestart = FamilyTopic(subscribe = {}, unsubscribe = { calls += "retry $it" }, pending = store)
        afterRestart.retryPending()
        assertEquals(listOf("retry pls-drill-test-1-family"), calls)
        assertEquals(emptyList<String>(), afterRestart.pendingTopics())
    }

    /** Joining the same search again cancels a pending unsubscribe, so a later retry cannot drop the new join. */
    @Test fun rejoiningCancelsAPendingUnsubscribe(): Unit = runBlocking {
        unsubscribeFails = true
        topic.left("drill-dev-1")
        topic.joined("drill-dev-1")
        assertEquals(emptyList<String>(), topic.pendingTopics())
    }
}
