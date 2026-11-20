package app.pointlastseen.family.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class PhotoConsentWithdrawalTest {
    private class MemoryStore : KeyValueStore {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    private val sha1 = "a".repeat(64)
    private val sha2 = "b".repeat(64)

    @Test fun theRecordsThisPhoneMadeAreRemembered() {
        val consented = ConsentedPhotos(MemoryStore())
        consented.add("inc-1", sha1)
        consented.add("inc-1", sha2)
        consented.add("inc-1", sha1)
        assertEquals(listOf(sha1, sha2), consented.list("inc-1"))
        assertEquals(emptyList<String>(), consented.list("inc-2"))
    }

    /**
     * The upload adds on a worker thread while a withdrawal removes on the main thread: each update is whole, so
     * neither undoes the other (an add that read the list before a removal must not write the removed one back).
     */
    @Test fun anAddAndARemoveOnTwoThreadsBothTakeEffect() {
        val inGet = java.util.concurrent.CountDownLatch(1)
        val release = java.util.concurrent.CountDownLatch(1)
        val store = object : KeyValueStore {
            val m = java.util.concurrent.ConcurrentHashMap<String, String>()
            @Volatile var holdNextGet = false
            override fun get(key: String): String? {
                val v = m[key]
                if (holdNextGet) { holdNextGet = false; inGet.countDown(); release.await() }
                return v
            }
            override fun put(key: String, value: String) { m[key] = value }
            override fun remove(key: String) { m.remove(key) }
        }
        val consented = ConsentedPhotos(store).apply { add("inc-1", sha1) }
        store.holdNextGet = true
        val adder = Thread { consented.add("inc-1", sha2) }.apply { start() }
        inGet.await()
        val remover = Thread { consented.remove("inc-1", sha1) }.apply { start() }
        Thread.sleep(200)
        release.countDown()
        adder.join()
        remover.join()
        assertEquals(listOf(sha2), consented.list("inc-1"))
    }

    /** A consent kept on the phone whose write never reached the server (left mid-write, offline) is cleared, not failed. */
    @Test fun aRecordThatNeverLandedIsClearedNotCountedAsFailed() = runTest {
        val consented = ConsentedPhotos(MemoryStore()).apply { add("inc-1", sha1) }
        val result = PhotoConsentWithdrawal(consented, recordOwner = { _, _ -> RecordOwner.NONE }) { _, _ -> throw RuntimeException("PERMISSION_DENIED") }
            .withdrawAll("inc-1")
        assertEquals(PhotoConsentWithdrawal.Result(withdrawn = 1, failed = 0), result)
        assertEquals(emptyList<String>(), consented.list("inc-1"))
    }

    /** A listed consent whose record another family member made: only they can withdraw it, so it leaves this list and is reported. */
    @Test fun aRecordAnotherMemberMadeLeavesThisListAndIsReported() = runTest {
        val consented = ConsentedPhotos(MemoryStore()).apply { add("inc-1", sha1) }
        val result = PhotoConsentWithdrawal(consented, recordOwner = { _, _ -> RecordOwner.ANOTHER }) { _, _ -> throw RuntimeException("PERMISSION_DENIED") }
            .withdrawAll("inc-1")
        assertEquals(PhotoConsentWithdrawal.Result(withdrawn = 0, failed = 0, byAnother = 1), result)
        assertEquals(emptyList<String>(), consented.list("inc-1"))
    }

    /** Whose record it is: with no signed-in user, a record that exists cannot be told apart, so it counts as this user's and stays listed. */
    @Test fun ownershipWithNoSignedInUserKeepsTheRecord() {
        assertEquals(RecordOwner.NONE, RecordOwner.of(creator = null, me = "uid-1"))
        assertEquals(RecordOwner.ME, RecordOwner.of(creator = "uid-1", me = "uid-1"))
        assertEquals(RecordOwner.ANOTHER, RecordOwner.of(creator = "uid-2", me = "uid-1"))
        assertEquals(RecordOwner.ME, RecordOwner.of(creator = "uid-1", me = null))
        assertEquals(RecordOwner.NONE, RecordOwner.of(creator = null, me = null))
    }

    /** The note says what happened to each photo: turned off, not turned off, and allowed by another member. */
    @Test fun theNoteReportsEveryOutcome() {
        fun note(w: Int, f: Int, a: Int) = PhotoConsentWithdrawal.note(PhotoConsentWithdrawal.Result(w, f, a))
        assertEquals("The cloud read is off for 2 photos.", note(2, 0, 0))
        assertEquals("The cloud read is off for 1 photo. It could not be turned off for 1 photo. Check the connection and try again.", note(1, 1, 0))
        assertEquals("The cloud read could not be turned off for 2 photos. Check the connection and try again.", note(0, 2, 0))
        assertEquals("Another family member allowed the cloud read for 1 photo. Only they can turn it off.", note(0, 0, 1))
        assertEquals("No photo from this phone has the cloud read on.", note(0, 0, 0))
    }

    /** Withdrawing deletes every record this phone made; a record is forgotten only once its delete succeeded. */
    @Test fun withdrawingDeletesEachRecordAndKeepsOnlyTheFailedOnes() = runTest {
        val consented = ConsentedPhotos(MemoryStore()).apply { add("inc-1", sha1); add("inc-1", sha2) }
        val deleted = mutableListOf<String>()
        val result = PhotoConsentWithdrawal(consented) { _, sha -> if (sha == sha2) throw RuntimeException("offline"); deleted += sha }.withdrawAll("inc-1")
        assertEquals(listOf(sha1), deleted)
        assertEquals(PhotoConsentWithdrawal.Result(withdrawn = 1, failed = 1), result)
        assertEquals(listOf(sha2), consented.list("inc-1"))
    }
}
