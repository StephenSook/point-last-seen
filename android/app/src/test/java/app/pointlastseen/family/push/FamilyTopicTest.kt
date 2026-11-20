package app.pointlastseen.family.push

import app.pointlastseen.family.data.KeyValueStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
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

    /** Drops FCM never confirmed, left on disk for the next start. */
    private fun unconfirmed(vararg incidents: String) = runBlocking {
        val offline = FamilyTopic(subscribe = {}, unsubscribe = { throw IllegalStateException("offline") }, pending = store)
        incidents.forEach { offline.left(it) }
    }

    /** A retry checks each drop is still wanted just before sending it: a search joined meanwhile is not dropped. */
    @Test fun aRetryDoesNotDropASearchJoinedWhileItRuns() = runTest {
        unconfirmed("inc-a", "inc-b")
        val gate = CompletableDeferred<Unit>()
        val sent = mutableListOf<String>()
        val t = FamilyTopic(subscribe = { sent += "sub $it" }, unsubscribe = { sent += "unsub $it"; if (it == "pls-inc-a-family") gate.await() }, pending = store)
        val retry = launch { t.retryPending() }
        runCurrent()
        t.joined("inc-b")
        gate.complete(Unit)
        retry.join()
        assertEquals(listOf("unsub pls-inc-a-family", "sub pls-inc-b-family"), sent)
        assertEquals(emptyList<String>(), t.pendingTopics())
    }

    /** A confirmation for an older drop cannot clear a newer drop of the same topic that is still unconfirmed. */
    @Test fun anOlderConfirmationCannotClearANewerDrop() = runTest {
        val first = CompletableDeferred<Unit>()
        var sends = 0
        val t = FamilyTopic(
            subscribe = {},
            unsubscribe = { sends++; if (sends == 1) first.await() else throw IllegalStateException("offline") },
            pending = store,
        )
        val older = launch { t.left("inc-b") }
        runCurrent()
        t.joined("inc-b")
        assertFalse(t.left("inc-b"))
        first.complete(Unit)
        older.join()
        assertEquals(listOf("pls-inc-b-family"), t.pendingTopics())
    }

    /** Joining the same search again cancels a pending unsubscribe, so a later retry cannot drop the new join. */
    @Test fun rejoiningCancelsAPendingUnsubscribe(): Unit = runBlocking {
        unsubscribeFails = true
        topic.left("drill-dev-1")
        topic.joined("drill-dev-1")
        assertEquals(emptyList<String>(), topic.pendingTopics())
    }
}
