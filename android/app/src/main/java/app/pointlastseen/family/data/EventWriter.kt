package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await
import java.util.concurrent.ConcurrentHashMap

enum class WriteState { PENDING, ACKNOWLEDGED, REJECTED }

/** Where events are written; the Firebase one is incidents/{incidentId}/events/{eventId}. */
interface EventStore {
    fun write(doc: EventDoc, onResult: (Throwable?) -> Unit)
    suspend fun existsOnServer(incidentId: String, eventId: String): Boolean?
}

/**
 * Writes events without awaiting them (spec Global Constraints). A denied write is
 * read back from the server before it is shown as rejected: an identical re-send
 * is denied because events are create-only, yet the first copy may have landed.
 */
class EventWriter(
    private val store: EventStore,
    private val serverTimestamp: () -> Any = { FieldValue.serverTimestamp() },
) {
    private val state = MutableStateFlow<Map<String, WriteState>>(emptyMap())
    val states: StateFlow<Map<String, WriteState>> = state
    private val docs = ConcurrentHashMap<String, EventDoc>()
    private val results = Channel<Pair<String, Throwable?>>(Channel.UNLIMITED)

    fun submit(doc: EventDoc) {
        val d = doc.copy(serverTime = serverTimestamp())
        docs[d.eventId] = d
        send(d)
    }

    fun retry(eventId: String) {
        docs[eventId]?.let { send(it) }
    }

    /** Resends every refused write of [incidentId] with its same id (a landed copy reads back as acknowledged). */
    fun retryRejected(incidentId: String) {
        state.value.filterValues { it == WriteState.REJECTED }.keys
            .mapNotNull { docs[it] }
            .filter { it.incidentId == incidentId }
            .forEach { send(it) }
    }

    /** The phone left [incidentId]: its writes are no longer shown or offered again; answers still coming are ignored. */
    fun forget(incidentId: String) {
        val gone = docs.filterValues { it.incidentId == incidentId }.keys
        gone.forEach { docs.remove(it) }
        state.update { it - gone }
    }

    fun lastWritten(eventId: String): EventDoc? = docs[eventId]

    private fun send(d: EventDoc) {
        mark(d.eventId, WriteState.PENDING)
        store.write(d) { err -> results.trySend(d.eventId to err) }
    }

    /** Handles every result received so far (tests and one-shot callers). */
    suspend fun settle() {
        while (true) handle(results.tryReceive().getOrNull() ?: return)
    }

    /** Handles results for as long as the caller's scope lives. */
    suspend fun run() {
        for (r in results) handle(r)
    }

    private suspend fun handle(r: Pair<String, Throwable?>) {
        val (id, err) = r
        if (!docs.containsKey(id)) return
        if (err == null) return mark(id, WriteState.ACKNOWLEDGED)
        val incidentId = docs[id]?.incidentId ?: return
        when (store.existsOnServer(incidentId, id)) {
            true -> mark(id, WriteState.ACKNOWLEDGED)
            false -> mark(id, WriteState.REJECTED)
            null -> mark(id, WriteState.PENDING)
        }
    }

    private fun mark(id: String, s: WriteState) = state.update { it + (id to s) }
}

class FirestoreEventStore : EventStore {
    private fun ref(incidentId: String, eventId: String) =
        Firebase.firestore.collection("incidents").document(incidentId).collection("events").document(eventId)

    override fun write(doc: EventDoc, onResult: (Throwable?) -> Unit) {
        ref(doc.incidentId, doc.eventId).set(doc.toMap()).addOnCompleteListener { onResult(it.exception) }
    }

    override suspend fun existsOnServer(incidentId: String, eventId: String): Boolean? = try {
        ref(incidentId, eventId).get(Source.SERVER).await().exists()
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        null
    }
}
