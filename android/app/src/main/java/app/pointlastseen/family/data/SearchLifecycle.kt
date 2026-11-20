package app.pointlastseen.family.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull

/** Which join a result belongs to: it changes on every join, leave and drop, and with the signed-in user. */
data class JoinTicket(val generation: Long, val uid: String?)

/** Hands out [JoinTicket]s; a result whose ticket is no longer current is for a join the phone has left. */
class JoinGeneration(private val uid: () -> String?) {
    private var generation = 0L

    fun ticket(): JoinTicket = JoinTicket(generation, uid())

    /** A join, a leave or a drop: every ticket handed out before this one is stale. */
    fun next() {
        generation++
    }

    fun isCurrent(t: JoinTicket): Boolean = t.generation == generation && t.uid == uid()
}

/**
 * A start while joined: the membership answer comes first. Only when it keeps the search, and the phone is
 * still on the same join, is anything published; an answer for an older join changes nothing.
 */
object JoinedStart {
    suspend fun run(check: suspend () -> MembershipCheck, isCurrent: () -> Boolean, onKeep: () -> Unit, onDrop: () -> Unit) {
        val answer = check()
        if (!isCurrent()) return
        if (answer == MembershipCheck.DROP) onDrop() else onKeep()
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
