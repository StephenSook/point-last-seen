package app.pointlastseen.family.data

import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.MAX_PHOTO_BYTES
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoUploadTest {
    private class FakeBucket : PhotoBucket {
        val puts = mutableListOf<Pair<String, String>>()
        override suspend fun put(path: String, bytes: ByteArray, contentType: String) { puts += path to contentType }
    }

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2)
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
        val bucket = PhotoBucket { path, _, _ -> order += "upload $path" }
        val consents = PhotoConsentSink { incident, sha, record -> order += "record $incident $sha ${record.cloudProcessing.byUid}" }
        val out = PhotoUpload(bucket, consents).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
        val sha = Hashes.sha256Hex(jpeg)
        assertEquals(listOf("upload photos/inc-1/$sha.jpg", "record inc-1 $sha uid-1"), order)
        assertEquals(CloudRead.ALLOWED, out.cloudRead)
    }

    @Test fun withoutTheTickNoConsentRecordIsWritten() = runTest {
        val records = mutableListOf<String>()
        val out = PhotoUpload(FakeBucket(), { _, sha, _ -> records += sha }).upload("inc-1", jpeg, consent = null) as PhotoOutcome.Uploaded
        assertEquals(emptyList<String>(), records)
        assertEquals(CloudRead.NOT_ASKED, out.cloudRead)
    }

    @Test fun aFailedUploadWritesNoConsentRecord() = runTest {
        val records = mutableListOf<String>()
        val out = PhotoUpload({ _, _, _ -> throw RuntimeException("storage down") }, { _, sha, _ -> records += sha }).upload("inc-1", jpeg, tick)
        assertTrue(out is PhotoOutcome.Failed)
        assertEquals(emptyList<String>(), records)
    }

    /** A record the server refuses leaves the photo uploaded but not readable in the cloud, and says so. */
    @Test fun aConsentRecordThatCannotBeSavedLeavesThePhotoUnreadableInTheCloud() = runTest {
        val out = PhotoUpload(FakeBucket(), { _, _, _ -> throw RuntimeException("PERMISSION_DENIED") }).upload("inc-1", jpeg, tick) as PhotoOutcome.Uploaded
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
            var seen: String? = null
            val bucket = PhotoBucket { _, _, _ -> seen = Thread.currentThread().name }
            PhotoUpload(bucket, worker = pool.asCoroutineDispatcher()).upload("inc-1", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1))
            assertEquals("pls-test-worker", seen)
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
        val bucket = object : PhotoBucket {
            override suspend fun put(path: String, bytes: ByteArray, contentType: String) = throw IllegalStateException("403 raw")
        }
        val out = PhotoUpload(bucket).upload("inc-1", byteArrayOf(0xFF.toByte(), 0xD8.toByte())) as PhotoOutcome.Failed
        assertTrue(!out.message.contains("403"))
    }
}
