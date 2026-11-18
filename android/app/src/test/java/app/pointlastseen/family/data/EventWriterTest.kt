package app.pointlastseen.family.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class EventWriterTest {
    private class FakeStore : EventStore {
        val writes = mutableListOf<String>()
        var pending = mutableMapOf<String, (Throwable?) -> Unit>()
        var onServer = mutableMapOf<String, Boolean?>()
        override fun write(doc: EventDoc, onResult: (Throwable?) -> Unit) {
            writes += doc.eventId
            pending[doc.eventId] = onResult
        }
        override suspend fun existsOnServer(incidentId: String, eventId: String): Boolean? = onServer[eventId]
    }

    private val doc = Events.familySighting(
        FamilySightingInput(900_000L, null, "by the mill", "n", "blue", "black", "", "", ""),
        EventContext("inc-1", "dev-1", "uid-1", 1, 1_000_000L) { 7L },
    )

    @Test fun aWriteIsPendingUntilTheServerAnswers() = runTest {
        val store = FakeStore()
        val w = EventWriter(store)
        w.submit(doc)
        assertEquals(WriteState.PENDING, w.states.value[doc.eventId])
        store.pending.getValue(doc.eventId).invoke(null)
        w.settle()
        assertEquals(WriteState.ACKNOWLEDGED, w.states.value[doc.eventId])
    }

    @Test fun deniedWriteThatExistsOnServerIsAcknowledged() = runTest {
        val store = FakeStore().apply { onServer[doc.eventId] = true }
        val w = EventWriter(store)
        w.submit(doc)
        store.pending.getValue(doc.eventId).invoke(IllegalStateException("PERMISSION_DENIED"))
        w.settle()
        assertEquals(WriteState.ACKNOWLEDGED, w.states.value[doc.eventId])
    }

    @Test fun rejectedStaysVisibleAndRetryable() = runTest {
        val store = FakeStore().apply { onServer[doc.eventId] = false }
        val w = EventWriter(store)
        w.submit(doc)
        store.pending.getValue(doc.eventId).invoke(IllegalStateException("PERMISSION_DENIED"))
        w.settle()
        assertEquals(WriteState.REJECTED, w.states.value[doc.eventId])
        w.retry(doc.eventId)
        assertEquals(listOf(doc.eventId, doc.eventId), store.writes)
        assertEquals(WriteState.PENDING, w.states.value[doc.eventId])
    }

    @Test fun aFailedReadBackKeepsTheWritePending() = runTest {
        val store = FakeStore().apply { onServer[doc.eventId] = null }
        val w = EventWriter(store)
        w.submit(doc)
        store.pending.getValue(doc.eventId).invoke(IllegalStateException("UNAVAILABLE"))
        w.settle()
        assertEquals(WriteState.PENDING, w.states.value[doc.eventId])
    }

    @Test fun theWriterSetsTheServerTimestamp() = runTest {
        val store = FakeStore()
        val w = EventWriter(store, serverTimestamp = { "SERVER_TS" })
        w.submit(doc)
        assertEquals("SERVER_TS", w.lastWritten(doc.eventId)?.serverTime)
    }
}
