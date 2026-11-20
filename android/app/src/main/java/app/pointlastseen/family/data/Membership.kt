package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** KEEP and DROP come from a refresh that succeeded; UNKNOWN means it could not run, so nothing is proven. */
enum class MembershipCheck { KEEP, DROP, UNKNOWN }

/**
 * Whether this phone still belongs to the search it joined. The app forgets a search only on proof: a forced
 * ID-token refresh that SUCCEEDS and whose claims no longer name this incident as family. A failed refresh
 * (offline, an App Check hiccup) or no signed-in user answers UNKNOWN: the search stays, but nothing is
 * published on that answer, and the app asks again ([retryDelay]).
 */
class Membership(private val refreshClaims: suspend () -> Map<String, Any?>) {
    suspend fun check(incidentId: String): MembershipCheck {
        val claims = try {
            // A refresh that never answers would hold the check and every later try behind it.
            withTimeoutOrNull(REFRESH_TIMEOUT_MS) { refreshClaims() } ?: return MembershipCheck.UNKNOWN
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return MembershipCheck.UNKNOWN
        }
        return if (claims["inc"] == incidentId && claims["role"] == Join.ROLE) MembershipCheck.KEEP else MembershipCheck.DROP
    }

    companion object {
        private val RETRY_MS = listOf(5_000L, 30_000L, 120_000L)
        private const val THEN_EVERY_MS = 300_000L
        private const val REFRESH_TIMEOUT_MS = 30_000L

        /** How long to wait before asking again after an UNKNOWN answer: 5 s, 30 s, 2 min, then every 5 min. */
        fun retryDelay(attempt: Int): Long = RETRY_MS.getOrNull(attempt) ?: THEN_EVERY_MS

        /** The signed-in user's claims after a forced token refresh; throws when there is no user or it fails. */
        fun firebase() = Membership {
            val user = checkNotNull(Firebase.auth.currentUser) { "not signed in" }
            user.getIdToken(true).await().claims
        }
    }
}
