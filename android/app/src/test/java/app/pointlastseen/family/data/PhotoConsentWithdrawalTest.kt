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
