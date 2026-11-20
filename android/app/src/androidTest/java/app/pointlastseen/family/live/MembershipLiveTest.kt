package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.Membership
import app.pointlastseen.family.data.MembershipCheck
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Against the test incident: right after joining, a forced refresh keeps the search; once someone with admin
 * rights clears this phone's family claims during the wait, the next forced refresh drops it. PLS-E2E lines carry
 * outcomes only, never a uid or a token.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class MembershipLiveTest {
    private fun log(s: String) = Log.i("PLS-E2E", s)

    @Test fun aClearedMembershipDropsOnlyAfterARefreshShowsIt(): Unit = runBlocking {
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(DrillCode.read()!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val membership = Membership.firebase()
        assertEquals(MembershipCheck.KEEP, membership.check(incidentId))
        log("membership kept right after joining incident=$incidentId; waiting up to $WAIT_MIN min for the claims to be cleared")
        val dropped = withTimeoutOrNull(WAIT_MIN * 60_000L) {
            while (membership.check(incidentId) != MembershipCheck.DROP) delay(15_000)
            true
        }
        assertTrue("the claims were cleared during the wait and a refresh showed it", dropped == true)
        log("membership dropped after a successful forced refresh")
    }

    private companion object {
        const val WAIT_MIN = 10
    }
}
