package app.pointlastseen.family.data

import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The incident fields the family app shows: drill mode, status and the prior version. */
data class IncidentInfo(
    val mode: String?,
    val status: String,
    val drillLabel: String,
    val name: String,
    val priorVersion: Long,
) {
    companion object {
        fun from(m: Map<String, Any?>?): IncidentInfo? {
            if (m == null) return null
            return IncidentInfo(
                mode = (m["mode"] as? String)?.takeIf { it == "drill" || it == "judge" },
                status = (m["status"] as? String)?.takeIf { it in setOf("open", "found", "closed") } ?: "open",
                drillLabel = m["drillLabel"] as? String ?: "",
                name = m["name"] as? String ?: "",
                priorVersion = (m["priorVersion"] as? Number)?.toLong() ?: 1L,
            )
        }
    }
}

/**
 * Listens to incidents/{incidentId}. A read the server refuses ([onDenied]) may mean this phone is no longer part
 * of the search; the caller checks that before forgetting anything. Errors are logged by code only, never data.
 */
class IncidentWatch(private val onDenied: () -> Unit = {}) {
    private val state = MutableStateFlow<IncidentInfo?>(null)
    val incident: StateFlow<IncidentInfo?> = state
    private var reg: ListenerRegistration? = null

    fun watch(incidentId: String) {
        reg?.remove()
        reg = Firebase.firestore.collection("incidents").document(incidentId).addSnapshotListener { snap, err ->
            if (err != null) {
                Log.w(TAG, "incident read failed code=${err.code}")
                if (err.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) onDenied()
                return@addSnapshotListener
            }
            if (snap != null) state.value = IncidentInfo.from(snap.data)
        }
    }

    fun stop() {
        reg?.remove()
        reg = null
    }

    private companion object {
        const val TAG = "PLS-WATCH"
    }
}
