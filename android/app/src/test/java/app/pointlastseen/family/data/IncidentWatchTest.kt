package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IncidentWatchTest {
    /** A fake listen: the test plays the server, per incident, through the callbacks it kept. */
    private class FakeListen : IncidentListen {
        val data = mutableMapOf<String, (Map<String, Any?>?) -> Unit>()
        val errors = mutableMapOf<String, (String) -> Unit>()
        val stopped = mutableListOf<String>()
        override fun listen(incidentId: String, onData: (Map<String, Any?>?) -> Unit, onError: (String) -> Unit): () -> Unit {
            data[incidentId] = onData
            errors[incidentId] = onError
            return { stopped += incidentId }
        }
    }

    private val open = mapOf<String, Any?>("status" to "open", "mode" to "drill")
    private val found = mapOf<String, Any?>("status" to "found", "mode" to "drill")

    @Test fun aSnapshotCarriesItsIncident() {
        val listen = FakeListen()
        val w = IncidentWatch(listen, log = {})
        w.watch("a")
        listen.data.getValue("a")(open)
        assertEquals("a", w.incident.value?.incidentId)
        assertTrue(w.attached)
    }

    /** A refused read ends that listener: the watch reports it and is no longer attached. */
    @Test fun aRefusedReadIsReportedAndDetaches() {
        val listen = FakeListen()
        var denied = 0
        val w = IncidentWatch(listen, onDenied = { denied++ }, log = {})
        w.watch("a")
        listen.errors.getValue("a")("PERMISSION_DENIED")
        assertEquals(1, denied)
        assertFalse(w.attached)
    }

    @Test fun anotherErrorDetachesWithoutReportingARefusal() {
        val listen = FakeListen()
        var denied = 0
        val w = IncidentWatch(listen, onDenied = { denied++ }, log = {})
        w.watch("a")
        listen.errors.getValue("a")("UNAVAILABLE")
        assertEquals(0, denied)
        assertFalse(w.attached)
    }

    /** Stopping forgets the last snapshot, so a finished search's status cannot outlive it. */
    @Test fun stoppingForgetsTheSnapshot() {
        val listen = FakeListen()
        val w = IncidentWatch(listen, log = {})
        w.watch("a")
        listen.data.getValue("a")(found)
        w.stop()
        assertNull(w.incident.value)
        assertEquals(listOf("a"), listen.stopped)
    }

    /** Watching another incident starts empty, and a late snapshot of the old one is ignored. */
    @Test fun switchingIncidentsStartsEmptyAndIgnoresTheOldOne() {
        val listen = FakeListen()
        val w = IncidentWatch(listen, log = {})
        w.watch("a")
        listen.data.getValue("a")(found)
        w.watch("b")
        assertNull(w.incident.value)
        listen.data.getValue("a")(found)
        assertNull(w.incident.value)
        listen.data.getValue("b")(open)
        assertEquals("open", w.incident.value?.status)
    }

    /** The status a screen may act on: only a snapshot of the search this phone is in now. */
    @Test fun aStatusCountsOnlyForTheCurrentSearch() {
        val info = IncidentInfo.from(found)!!.copy(incidentId = "a")
        assertEquals("found", IncidentWatch.statusFor(info, currentIncident = "a"))
        assertNull(IncidentWatch.statusFor(info, currentIncident = "b"))
        assertNull(IncidentWatch.statusFor(null, currentIncident = "a"))
    }

    /** Why a search ended counts, like its status, only for the search this phone is in now. */
    @Test fun aClosedReasonCountsOnlyForTheCurrentSearch() {
        val info = IncidentInfo.from(mapOf("status" to "closed", "closedReason" to "found"))!!.copy(incidentId = "a")
        assertEquals("found", IncidentWatch.closedReasonFor(info, currentIncident = "a"))
        assertNull(IncidentWatch.closedReasonFor(info, currentIncident = "b"))
        assertNull(IncidentWatch.closedReasonFor(null, currentIncident = "a"))
    }

    /** The search this phone is in has ended when it is found or closed; another search's snapshot never counts. */
    @Test fun aSearchHasEndedOnlyWhenTheCurrentOneIsFoundOrClosed() {
        fun info(status: String) = IncidentInfo.from(mapOf("status" to status))!!.copy(incidentId = "a")
        assertTrue(IncidentWatch.ended(info("closed"), currentIncident = "a"))
        assertTrue(IncidentWatch.ended(info("found"), currentIncident = "a"))
        assertFalse(IncidentWatch.ended(info("open"), currentIncident = "a"))
        assertFalse(IncidentWatch.ended(info("closed"), currentIncident = "b"))
        assertFalse(IncidentWatch.ended(null, currentIncident = "a"))
    }

    /** After a refused read that kept the search, the watch is tried again a few times, then waits for the foreground. */
    @Test fun reattachingIsBounded() {
        assertEquals(listOf(5_000L, 30_000L, 120_000L, null), (0..3).map { IncidentWatch.reattachDelay(it) })
    }
}
