package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.firebase.functions.functions
import kotlinx.coroutines.tasks.await

/** What joining needs from Auth and the joinIncident callable. */
interface JoinBackend {
    suspend fun ensureSignedIn(): String
    suspend fun callJoin(payload: Map<String, Any?>): Any?
    suspend fun refreshClaims(): Map<String, Any?>
}

/** The callable refused the code itself (wrong, expired, or for another role): not a connection problem. */
class JoinRefused : Exception("join code refused") {
    companion object {
        /** By the code's name: the SDK's Code enum cannot load in JVM unit tests. */
        fun isRefusal(codeName: String): Boolean =
            codeName in setOf("PERMISSION_DENIED", "INVALID_ARGUMENT", "NOT_FOUND", "FAILED_PRECONDITION")
    }
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
        } catch (e: JoinRefused) {
            JoinOutcome.Failed(REFUSED)
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
    override suspend fun ensureSignedIn(): String = FirebaseSignIn.ensureSignedIn()

    override suspend fun callJoin(payload: Map<String, Any?>): Any? = try {
        Firebase.functions.getHttpsCallable("joinIncident").call(payload).await().getData()
    } catch (e: FirebaseFunctionsException) {
        if (JoinRefused.isRefusal(e.code.name)) throw JoinRefused() else throw e
    }

    override suspend fun refreshClaims(): Map<String, Any?> {
        val user = requireNotNull(Firebase.auth.currentUser)
        return user.getIdToken(true).await().claims
    }
}
