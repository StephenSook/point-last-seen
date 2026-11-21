package app.pointlastseen.family.data

import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * The incident fields the family app shows: drill mode, status, why command ended it ([closedReason]) and the prior
 * version, for [incidentId].
 */
data class IncidentInfo(
    val mode: String?,
    val status: String,
    val drillLabel: String,
    val name: String,
    val priorVersion: Long,
    val incidentId: String = "",
    /** Why command closed the search: found, suspended or training_ended; null while open or with no known reason. */
    val closedReason: String? = null,
) {
    companion object {
        fun from(m: Map<String, Any?>?): IncidentInfo? {
            if (m == null) return null
            val status = (m["status"] as? String)?.takeIf { it in setOf("open", "found", "closed") } ?: "open"
            return IncidentInfo(
                mode = (m["mode"] as? String)?.takeIf { it == "drill" || it == "judge" },
                status = status,
                drillLabel = m["drillLabel"] as? String ?: "",
                name = m["name"] as? String ?: "",
                priorVersion = (m["priorVersion"] as? Number)?.toLong() ?: 1L,
                // The reasons command can give when it ends a search (web/src/data/endSearch.ts END_REASONS).
                closedReason = (m["closedReason"] as? String)?.takeIf { status == "closed" && it in setOf("found", "suspended", "training_ended") },
            )
        }
    }
}

/** One listen on incidents/{incidentId}: the document's fields, or an error by its code name; returns a stop. */
fun interface IncidentListen {
    fun listen(incidentId: String, onData: (Map<String, Any?>?) -> Unit, onError: (String) -> Unit): () -> Unit
}

/**
 * Listens to the incident this phone joined. A read the server refuses ends the listener: the watch is then
 * detached and [onDenied] asks whether this phone is still part of the search; the caller decides whether to
 * forget it or to watch again. Stopping, or watching another incident, forgets the last snapshot, so one
 * search's status never shows for another. Errors are logged by code only, never data.
 */
class IncidentWatch(
    private val listen: IncidentListen = FIRESTORE,
    private val onDenied: () -> Unit = {},
    private val log: (String) -> Unit = { Log.w(TAG, it) },
) {
    private val state = MutableStateFlow<IncidentInfo?>(null)
    val incident: StateFlow<IncidentInfo?> = state
    private var current: String? = null
    private var stopListen: (() -> Unit)? = null

    /** Whether a listener is running; false after [stop] or after the server ended it. */
    val attached: Boolean get() = stopListen != null

    fun watch(incidentId: String) {
        stop()
        current = incidentId
        stopListen = listen.listen(
            incidentId,
            { m -> if (current == incidentId) state.value = IncidentInfo.from(m)?.copy(incidentId = incidentId) },
            { code ->
                if (current == incidentId) {
                    log("incident read failed code=$code")
                    stopListen = null
                    if (code == "PERMISSION_DENIED") onDenied()
                }
            },
        )
    }

    fun stop() {
        stopListen?.invoke()
        stopListen = null
        current = null
        state.value = null
    }

    companion object {
        private const val TAG = "PLS-WATCH"
        private val REATTACH_DELAYS_MS = listOf(5_000L, 30_000L, 120_000L)

        /** How long to wait before watching again after a refused read kept the search; null: wait for the foreground. */
        fun reattachDelay(attempt: Int): Long? = REATTACH_DELAYS_MS.getOrNull(attempt)

        /** The status a screen may act on: only a snapshot of the search this phone is in now. */
        fun statusFor(info: IncidentInfo?, currentIncident: String?): String? =
            info?.takeIf { currentIncident != null && it.incidentId == currentIncident }?.status

        /** Whether the search this phone is in now has ended (found or closed): it then takes no new data. */
        fun ended(info: IncidentInfo?, currentIncident: String?): Boolean = statusFor(info, currentIncident) in setOf("found", "closed")

        /** Why command ended the search this phone is in now; null for any other search's snapshot. */
        fun closedReasonFor(info: IncidentInfo?, currentIncident: String?): String? =
            info?.takeIf { currentIncident != null && it.incidentId == currentIncident }?.closedReason

        private val FIRESTORE = IncidentListen { incidentId, onData, onError ->
            val reg = Firebase.firestore.collection("incidents").document(incidentId).addSnapshotListener { snap, err ->
                if (err != null) onError(err.code.name) else if (snap != null) onData(snap.data)
            }
            val stop: () -> Unit = { reg.remove() }
            stop
        }
    }
}
