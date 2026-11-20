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

    /** A consent kept on the phone whose write never reached the server (left mid-write, offline) is cleared, not failed. */
    @Test fun aRecordThatNeverLandedIsClearedNotCountedAsFailed() = runTest {
        val consented = ConsentedPhotos(MemoryStore()).apply { add("inc-1", sha1) }
        val result = PhotoConsentWithdrawal(consented, isOnServer = { _, _ -> false }) { _, _ -> throw RuntimeException("PERMISSION_DENIED") }
            .withdrawAll("inc-1")
        assertEquals(PhotoConsentWithdrawal.Result(withdrawn = 1, failed = 0), result)
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
