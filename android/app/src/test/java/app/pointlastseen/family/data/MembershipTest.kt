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

    /** A refresh that failed (an App Check hiccup, an expired session) proves nothing, so the search stays. */
    @Test fun aFailedRefreshKeepsTheSearch(): Unit = runBlocking {
        assertEquals(MembershipCheck.KEEP, membership { throw IllegalStateException("token refresh refused") }.check("drill-test-1"))
    }

    /** Offline, the refresh cannot reach the server: the search stays and the next start checks again. */
    @Test fun offlineKeepsTheSearch(): Unit = runBlocking {
        assertEquals(MembershipCheck.KEEP, membership { throw IOException("network unreachable") }.check("drill-test-1"))
    }

    @Test fun aCancelledCheckIsNotAnAnswer() {
        assertThrows(CancellationException::class.java) {
            runBlocking { membership { throw CancellationException("left") }.check("drill-test-1") }
        }
    }
}
