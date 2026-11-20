package app.pointlastseen.family.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchLifecycleTest {
    /** At start while joined, nothing is published until the membership answer is in, and then only on KEEP. */
    @Test fun aStartPublishesOnlyAfterTheMembershipAnswerKeepsTheSearch() = runTest {
        val answer = CompletableDeferred<MembershipCheck>()
        val log = mutableListOf<String>()
        val start = launch { JoinedStart.run({ answer.await() }, { true }, onKeep = { log += "publish" }, onDrop = { log += "drop" }) }
        advanceUntilIdle()
        assertEquals(emptyList<String>(), log)
        answer.complete(MembershipCheck.KEEP)
        start.join()
        assertEquals(listOf("publish"), log)
    }

    @Test fun aStartWhoseAnswerDropsNeverPublishes() = runTest {
        val log = mutableListOf<String>()
        JoinedStart.run({ MembershipCheck.DROP }, { true }, onKeep = { log += "publish" }, onDrop = { log += "drop" })
        assertEquals(listOf("drop"), log)
    }

    /** An answer for a join the phone has since left (or rejoined) changes nothing. */
    @Test fun anAnswerForAnOlderJoinIsDiscarded() = runTest {
        val log = mutableListOf<String>()
        JoinedStart.run({ MembershipCheck.DROP }, { false }, onKeep = { log += "publish" }, onDrop = { log += "drop" })
        JoinedStart.run({ MembershipCheck.KEEP }, { false }, onKeep = { log += "publish" }, onDrop = { log += "drop" })
        assertEquals(emptyList<String>(), log)
    }

    /** Every join, leave and drop makes a new generation; a ticket from before it is no longer current. */
    @Test fun aTicketIsCurrentOnlyForItsJoinAndItsUser() {
        var uid: String? = "u1"
        val g = JoinGeneration { uid }
        val first = g.ticket()
        assertTrue(g.isCurrent(first))
        g.next()
        assertFalse(g.isCurrent(first))
        val second = g.ticket()
        assertTrue(g.isCurrent(second))
        uid = "u2"
        assertFalse(g.isCurrent(second))
    }

    /** Leaving forgets the search first (so no new write starts), lets sent writes settle, then finishes. */
    @Test fun leavingForgetsFirstThenSettlesThenFinishes() = runTest {
        val log = mutableListOf<String>()
        Departure.leave(forget = { log += "forget" }, settle = { log += "settle" }, timeoutMs = 5_000, finish = { log += "finish" })
        assertEquals(listOf("forget", "settle", "finish"), log)
    }

    /** A settle that fails (the SDK refused the wait) still finishes the leave: the topic drop must not be skipped. */
    @Test fun leavingFinishesWhenSettlingFails() = runTest {
        val log = mutableListOf<String>()
        Departure.leave(forget = { log += "forget" }, settle = { throw IllegalStateException("terminated") }, timeoutMs = 5_000, finish = { log += "finish" })
        assertEquals(listOf("forget", "finish"), log)
    }

    /** Offline, the sent writes cannot settle: leaving still finishes after the bound. */
    @Test fun leavingFinishesAfterTheBoundWhenWritesCannotSettle() = runTest {
        val log = mutableListOf<String>()
        Departure.leave(forget = { log += "forget" }, settle = { awaitCancellation() }, timeoutMs = 5_000, finish = { log += "finish" })
        assertEquals(listOf("forget", "finish"), log)
        assertEquals(5_000L, testScheduler.currentTime)
    }
}
