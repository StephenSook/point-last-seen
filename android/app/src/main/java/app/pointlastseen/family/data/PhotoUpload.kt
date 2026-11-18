package app.pointlastseen.family.data

import app.pointlastseen.family.core.MAX_PHOTO_BYTES
import com.google.firebase.Firebase
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.tasks.await

fun interface PhotoBucket {
    suspend fun put(path: String, bytes: ByteArray, contentType: String)
}

sealed class PhotoOutcome {
    data class Uploaded(val path: String) : PhotoOutcome()
    data class Refused(val message: String) : PhotoOutcome()
    data class Failed(val message: String) : PhotoOutcome()
}

/**
 * Uploads a standardized family photo (JpegEncoder output) to
 * photos/{incidentId}/{sha256}.jpg. Only a JPEG under the 2 MB cap is sent.
 */
class PhotoUpload(private val bucket: PhotoBucket) {
    suspend fun upload(incidentId: String, jpeg: ByteArray): PhotoOutcome {
        if (jpeg.size < 2 || jpeg[0] != 0xFF.toByte() || jpeg[1] != 0xD8.toByte()) return PhotoOutcome.Refused("This is not a photo.")
        if (jpeg.size > MAX_PHOTO_BYTES) return PhotoOutcome.Refused("This photo is too large.")
        val path = "photos/$incidentId/${Hashes.sha256Hex(jpeg)}.jpg"
        return try {
            bucket.put(path, jpeg, "image/jpeg")
            PhotoOutcome.Uploaded(path)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            PhotoOutcome.Failed("The photo did not upload. Check the connection and try again.")
        }
    }
}

class FirebasePhotoBucket : PhotoBucket {
    override suspend fun put(path: String, bytes: ByteArray, contentType: String) {
        Firebase.storage.reference.child(path).putBytes(bytes, storageMetadata { this.contentType = contentType }).await()
    }
}
