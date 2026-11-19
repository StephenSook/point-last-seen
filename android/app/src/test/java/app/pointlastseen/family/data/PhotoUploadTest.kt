package app.pointlastseen.family.data

import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.MAX_PHOTO_BYTES
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoUploadTest {
    /** Storage at photos/...: [stored] paths already exist (photos are create-only); [order] records each step. */
    private class FakeBucket(
        val stored: MutableSet<String> = mutableSetOf(),
        private val order: MutableList<String> = mutableListOf(),
        private val putFails: Boolean = false,
        private val checkFails: Boolean = false,
    ) : PhotoBucket {
        val puts = mutableListOf<Pair<String, String>>()
        var putThread: String? = null
        override suspend fun exists(path: String): Boolean {
            order += "check $path"
            if (checkFails) throw IllegalStateException("503 raw")
            return path in stored
        }
        override suspend fun put(path: String, bytes: ByteArray, contentType: String) {
            putThread = Thread.currentThread().name
            if (putFails) throw IllegalStateException("403 raw")
            order += "upload $path"
            puts += path to contentType
            stored += path
        }
    }

    /** photoConsents/{sha256}: [creators] maps a hash to the uid that created its record. */
    private class FakeSink(
        val creators: MutableMap<String, String> = mutableMapOf(),
        private val order: MutableList<String> = mutableListOf(),
        private val createFails: Boolean = false,
    ) : PhotoConsentSink {
        val created = mutableListOf<String>()
        override suspend fun creatorOf(incidentId: String, sha256: String): String? = creators[sha256]
        override suspend fun create(incidentId: String, sha256: String, record: PhotoConsentRecord) {
            if (createFails) throw RuntimeException("PERMISSION_DENIED")
            order += "record $incidentId $sha256 ${record.cloudProcessing.byUid}"
            created += sha256
            creators[sha256] = record.createdByUid
        }
    }

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2)
    private val sha = Hashes.sha256Hex(jpeg)
    private val path = "photos/inc-1/$sha.jpg"
    private val tick = ConsentMark("uid-1", 1795000000123L)

    /** incidents/{id}/photoConsents/{sha256}: exactly these four fields. */
    @Test fun theConsentRecordHasExactlyTheRuledShape() {
        val sha = "ab".repeat(32)
        val server = Any()
        assertEquals(
            mapOf(
                "storagePath" to "photos/inc-1/$sha.jpg",
                "cloudProcessing" to mapOf("byUid" to "uid-1", "atMs" to 1795000000123L),
                "createdByUid" to "uid-1",
                "createdAt" to server,
            ),
            PhotoConsentRecord.of("inc-1", sha, tick).toMap(server),
        )
    }

    @Test fun withTheTickTheConsentRecordIsWrittenAfterTheUpload() = runTest {
        val order = mutableListOf<String>()
        val out = PhotoUpload(FakeBucket(order = order), FakeSink(order = order)).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
        assertEquals(listOf("check $path", "upload $path", "record inc-1 $sha uid-1"), order)
        assertEquals(CloudRead.ALLOWED, out.cloudRead)
    }

    @Test fun withoutTheTickNoConsentRecordIsWritten() = runTest {
        val sink = FakeSink()
        val out = PhotoUpload(FakeBucket(), sink).upload("inc-1", jpeg, consent = null) as PhotoOutcome.Uploaded
        assertEquals(emptyList<String>(), sink.created)
        assertEquals(CloudRead.NOT_ASKED, out.cloudRead)
    }

    @Test fun aFailedUploadWritesNoConsentRecord() = runTest {
        val sink = FakeSink()
        val out = PhotoUpload(FakeBucket(putFails = true), sink).upload("inc-1", jpeg, tick)
        assertTrue(out is PhotoOutcome.Failed)
        assertEquals(emptyList<String>(), sink.created)
    }

    /** A record the server refuses leaves the photo uploaded but not readable in the cloud, and says so. */
    @Test fun aConsentRecordThatCannotBeSavedLeavesThePhotoUnreadableInTheCloud() = runTest {
        val out = PhotoUpload(FakeBucket(), FakeSink(createFails = true)).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
        assertEquals(CloudRead.NOT_SAVED, out.cloudRead)
    }

    @Test fun aPhotoGoesToItsIncidentUnderItsHash() = runTest {
        val bytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 3)
        val bucket = FakeBucket()
        val out = PhotoUpload(bucket).upload("inc-1", bytes) as PhotoOutcome.Uploaded
        assertEquals("photos/inc-1/${Hashes.sha256Hex(bytes)}.jpg", out.path)
        assertEquals(listOf(out.path to "image/jpeg"), bucket.puts)
    }

    @Test fun hashingAndUploadRunOnTheGivenWorker() = runTest {
        val pool = java.util.concurrent.Executors.newSingleThreadExecutor { r -> Thread(r, "pls-test-worker") }
        try {
            val bucket = FakeBucket()
            PhotoUpload(bucket, worker = pool.asCoroutineDispatcher()).upload("inc-1", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1))
            assertEquals("pls-test-worker", bucket.putThread)
        } finally {
            pool.shutdown()
        }
    }

    @Test fun somethingThatIsNotAJpegIsRefused() = runTest {
        val bucket = FakeBucket()
        assertTrue(PhotoUpload(bucket).upload("inc-1", byteArrayOf(1, 2, 3)) is PhotoOutcome.Refused)
        assertTrue(bucket.puts.isEmpty())
    }

    @Test fun aPhotoOverTheCapIsRefused() = runTest {
        val big = ByteArray(MAX_PHOTO_BYTES + 1).also { it[0] = 0xFF.toByte(); it[1] = 0xD8.toByte() }
        val bucket = FakeBucket()
        assertTrue(PhotoUpload(bucket).upload("inc-1", big) is PhotoOutcome.Refused)
        assertTrue(bucket.puts.isEmpty())
    }

    @Test fun aStorageErrorIsAPlainFailure() = runTest {
        val out = PhotoUpload(FakeBucket(putFails = true)).upload("inc-1", byteArrayOf(0xFF.toByte(), 0xD8.toByte())) as PhotoOutcome.Failed
        assertTrue(!out.message.contains("403"))
    }

    /** Photos are create-only, so sharing the same photo again finds it stored and uploads nothing. */
    @Test fun aPhotoAlreadyStoredIsNotUploadedAgain() = runTest {
        val bucket = FakeBucket(stored = mutableSetOf(path))
        val out = PhotoUpload(bucket, FakeSink()).upload("inc-1", jpeg) as PhotoOutcome.Uploaded
        assertEquals(path, out.path)
        assertEquals(CloudRead.NOT_ASKED, out.cloudRead)
        assertTrue(bucket.puts.isEmpty())
    }

    /** Sharing it again with the tick finds this sharer's own record (create-only too) and writes none. */
    @Test fun aReshareWithTheTickFindsItsOwnRecord() = runTest {
        val sink = FakeSink(creators = mutableMapOf(sha to "uid-1"))
        val out = PhotoUpload(FakeBucket(stored = mutableSetOf(path)), sink).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
        assertEquals(CloudRead.ALLOWED, out.cloudRead)
        assertEquals(emptyList<String>(), sink.created)
    }

    /** Another family member's record already allows the cloud read; it is not rewritten, and only they can withdraw it. */
    @Test fun anotherMembersRecordIsNeitherRewrittenNorClaimed() = runTest {
        val sink = FakeSink(creators = mutableMapOf(sha to "uid-2"))
        val out = PhotoUpload(FakeBucket(stored = mutableSetOf(path)), sink).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
        assertEquals(CloudRead.ALLOWED_BY_ANOTHER, out.cloudRead)
        assertEquals(emptyList<String>(), sink.created)
    }

    /** A Storage check that cannot run proves neither, so nothing is uploaded or recorded, and no raw text shows. */
    @Test fun aStorageCheckThatCannotRunIsAPlainFailure() = runTest {
        val bucket = FakeBucket(checkFails = true)
        val sink = FakeSink()
        val out = PhotoUpload(bucket, sink).upload("inc-1", jpeg, tick) as PhotoOutcome.Failed
        assertTrue(!out.message.contains("503"))
        assertTrue(bucket.puts.isEmpty())
        assertEquals(emptyList<String>(), sink.created)
    }
}
