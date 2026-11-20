package app.pointlastseen.family.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Which join a result belongs to: it changes on every join, leave and drop, and with the signed-in user. */
data class JoinTicket(val generation: Long, val uid: String?)

/** Hands out [JoinTicket]s; a result whose ticket is no longer current is for a join the phone has left. */
class JoinGeneration(private val uid: () -> String?) {
    // Moved on the main thread; read by work on other threads too (photo, clip and profile writes).
    @Volatile private var generation = 0L

    fun ticket(): JoinTicket = JoinTicket(generation, uid())

    /** A join, a leave or a drop: every ticket handed out before this one is stale. */
    fun next() {
        generation++
    }

    fun isCurrent(t: JoinTicket): Boolean = t.generation == generation && t.uid == uid()

    @Volatile private var confirmedAt: JoinTicket? = null

    /**
     * The server confirmed the join [t] stands for: a join that just succeeded, or a refresh whose claims keep it.
     * It counts only while [t] is still current, for the same user that earned it.
     */
    fun confirm(t: JoinTicket) {
        if (isCurrent(t)) confirmedAt = t
    }

    /** Whether the current join is confirmed; the next join, leave or drop (or another user) ends it. */
    fun confirmed(): Boolean = confirmedAt?.let { isCurrent(it) } == true
}

/** Thrown before a cloud write when the phone has left the join the work started for. */
class LeftSearchException : IllegalStateException("this phone left the search")

/** Whether the phone is still on the join a piece of work started for; checked just before each cloud write. */
fun interface StillJoined {
    fun check(): Boolean

    fun require() {
        if (!check()) throw LeftSearchException()
    }
}

/**
 * A start while joined: the membership answer comes first. Only when it keeps the search (a refresh that
 * succeeded), and the phone is still on the same join, is anything published; UNKNOWN keeps the search and
 * publishes nothing; an answer for an older join changes nothing.
 */
object JoinedStart {
    suspend fun run(
        check: suspend () -> MembershipCheck,
        isCurrent: () -> Boolean,
        onKeep: () -> Unit,
        onDrop: () -> Unit,
        onUnknown: () -> Unit,
    ) {
        val answer = check()
        if (!isCurrent()) return
        when (answer) {
            MembershipCheck.KEEP -> onKeep()
            MembershipCheck.DROP -> onDrop()
            MembershipCheck.UNKNOWN -> onUnknown()
        }
    }
}

/**
 * Leaving a search. [forget] runs first, so no new write can start (every writer reads the session); the
 * writes already sent then get up to [timeoutMs] to settle; then [finish] reports it done, also when the wait
 * fails, so the clean-up after it always runs. Offline, a write sent before leaving is still delivered when
 * the phone reconnects (a stated limit).
 */
object Departure {
    suspend fun leave(forget: () -> Unit, settle: suspend () -> Unit, timeoutMs: Long, finish: () -> Unit) {
        forget()
        withTimeoutOrNull(timeoutMs) {
            try {
                settle()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // A wait that failed proves nothing about the writes; leaving goes on.
            }
        }
        finish()
    }
}

/** At most one pending wait: scheduling again replaces the earlier one, so retries for one purpose never stack. */
class OneTimer(private val scope: CoroutineScope) {
    private var job: Job? = null

    fun schedule(delayMs: Long, action: () -> Unit) {
        job?.cancel()
        job = scope.launch {
            delay(delayMs)
            action()
        }
    }

    fun cancel() {
        job?.cancel()
        job = null
    }
}
