package app.pointlastseen.family.data

import app.pointlastseen.family.core.MAX_PHOTO_BYTES
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoUploadTest {
    private class FakeBucket : PhotoBucket {
        val puts = mutableListOf<Pair<String, String>>()
        override suspend fun put(path: String, bytes: ByteArray, contentType: String) { puts += path to contentType }
    }

    @Test fun aPhotoGoesToItsIncidentUnderItsHash() = runTest {
        val bytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 3)
        val bucket = FakeBucket()
        val out = PhotoUpload(bucket).upload("inc-1", bytes) as PhotoOutcome.Uploaded
        assertEquals("photos/inc-1/${Hashes.sha256Hex(bytes)}.jpg", out.path)
        assertEquals(listOf(out.path to "image/jpeg"), bucket.puts)
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
