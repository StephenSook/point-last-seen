package app.pointlastseen.family.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class MembershipTest {
    private fun membership(refresh: suspend () -> Map<String, Any?>) = Membership(refresh)

    /** A refused read (or a start) asks for a forced refresh; refreshed claims without this incident drop it. */
    @Test fun refreshedClaimsWithoutTheIncidentDropTheSearch(): Unit = runBlocking {
        assertEquals(MembershipCheck.DROP, membership { emptyMap() }.check("drill-test-1"))
    }

    @Test fun refreshedClaimsForAnotherIncidentOrRoleDropTheSearch(): Unit = runBlocking {
        assertEquals(MembershipCheck.DROP, membership { mapOf("inc" to "drill-other", "role" to "family") }.check("drill-test-1"))
        assertEquals(MembershipCheck.DROP, membership { mapOf("inc" to "drill-test-1", "role" to "searcher") }.check("drill-test-1"))
    }

    @Test fun refreshedClaimsNamingThisIncidentAsFamilyKeepIt(): Unit = runBlocking {
        assertEquals(MembershipCheck.KEEP, membership { mapOf("inc" to "drill-test-1", "role" to "family", "team" to null) }.check("drill-test-1"))
    }

    /**
     * A refresh that failed (an App Check hiccup, an expired session) proves nothing: the search stays, but the
     * answer is UNKNOWN, not KEEP, so nothing is published on it.
     */
    @Test fun aFailedRefreshKeepsTheSearchUnconfirmed(): Unit = runBlocking {
        assertEquals(MembershipCheck.UNKNOWN, membership { throw IllegalStateException("token refresh refused") }.check("drill-test-1"))
    }

    /** Offline, the refresh cannot reach the server: the search stays unconfirmed and the app asks again later. */
    @Test fun offlineKeepsTheSearchUnconfirmed(): Unit = runBlocking {
        assertEquals(MembershipCheck.UNKNOWN, membership { throw IOException("network unreachable") }.check("drill-test-1"))
    }

    /** An unconfirmed answer is asked again after 5 s, 30 s and 2 min, then every 5 min while it stays unconfirmed. */
    @Test fun anUnconfirmedAnswerIsAskedAgainOnASchedule() {
        assertEquals(listOf(5_000L, 30_000L, 120_000L, 300_000L, 300_000L), (0..4).map { Membership.retryDelay(it) })
    }

    @Test fun aCancelledCheckIsNotAnAnswer() {
        assertThrows(CancellationException::class.java) {
            runBlocking { membership { throw CancellationException("left") }.check("drill-test-1") }
        }
    }
}
