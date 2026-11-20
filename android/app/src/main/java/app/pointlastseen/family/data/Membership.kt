package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

enum class MembershipCheck { KEEP, DROP }

/**
 * Whether this phone still belongs to the search it joined. The app forgets a search only on proof: a forced
 * ID-token refresh that SUCCEEDS and whose claims no longer name this incident as family. A refused read alone,
 * a failed refresh (offline, an App Check hiccup) or no signed-in user keeps the search; the next start or the
 * next refused read checks again.
 */
class Membership(private val refreshClaims: suspend () -> Map<String, Any?>) {
    suspend fun check(incidentId: String): MembershipCheck {
        val claims = try {
            refreshClaims()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return MembershipCheck.KEEP
        }
        return if (claims["inc"] == incidentId && claims["role"] == Join.ROLE) MembershipCheck.KEEP else MembershipCheck.DROP
    }

    companion object {
        /** The signed-in user's claims after a forced token refresh; throws when there is no user or it fails. */
        fun firebase() = Membership {
            val user = checkNotNull(Firebase.auth.currentUser) { "not signed in" }
            user.getIdToken(true).await().claims
        }
    }
}
