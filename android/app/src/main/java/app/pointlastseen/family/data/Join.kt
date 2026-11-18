package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.functions.functions
import kotlinx.coroutines.tasks.await

/** What joining needs from Auth and the joinIncident callable. */
interface JoinBackend {
    suspend fun ensureSignedIn(): String
    suspend fun callJoin(payload: Map<String, Any?>): Any?
    suspend fun refreshClaims(): Map<String, Any?>
}

sealed class JoinOutcome {
    data class Joined(val incidentId: String, val uid: String) : JoinOutcome()
    data class Failed(val message: String) : JoinOutcome()
}

/**
 * Joins an incident with the code command gives the family. The callable sets the
 * claims {inc, role, team}; the app force-refreshes its ID token and checks them.
 */
class Join(private val backend: JoinBackend) {
    suspend fun join(code: String): JoinOutcome {
        val joinCode = code.trim()
        if (joinCode.isEmpty()) return JoinOutcome.Failed("Type the code command gave you.")
        return try {
            val uid = backend.ensureSignedIn()
            val reply = backend.callJoin(mapOf("joinCode" to joinCode, "role" to ROLE)) as? Map<*, *>
            val incidentId = (reply?.get("incidentId") as? String)?.takeIf { reply["ok"] == true && it.isNotEmpty() }
                ?: return JoinOutcome.Failed(REFUSED)
            val claims = backend.refreshClaims()
            if (claims["inc"] != incidentId || claims["role"] != ROLE) return JoinOutcome.Failed(REFUSED)
            JoinOutcome.Joined(incidentId, uid)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            JoinOutcome.Failed("Could not reach command. Check the connection and try again.")
        }
    }

    companion object {
        const val ROLE = "family"
        const val REFUSED = "That code did not work. Check it with command."
    }
}

class FirebaseJoinBackend : JoinBackend {
    override suspend fun ensureSignedIn(): String {
        val auth = Firebase.auth
        val user = auth.currentUser ?: auth.signInAnonymously().await().user
        return requireNotNull(user?.uid) { "anonymous sign-in returned no user" }
    }

    override suspend fun callJoin(payload: Map<String, Any?>): Any? =
        Firebase.functions.getHttpsCallable("joinIncident").call(payload).await().getData()

    override suspend fun refreshClaims(): Map<String, Any?> {
        val user = requireNotNull(Firebase.auth.currentUser)
        return user.getIdToken(true).await().claims
    }
}
