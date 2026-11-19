package app.pointlastseen.family.data

import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.MAX_PHOTO_BYTES
import com.google.firebase.Firebase
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

fun interface PhotoBucket {
    suspend fun put(path: String, bytes: ByteArray, contentType: String)
}

/** Whether command may read an uploaded photo in the cloud. */
enum class CloudRead {
    /** The family did not tick it: no consent record, so command's cloud read stays off. */
    NOT_ASKED,
    /** The consent record is saved. */
    ALLOWED,
    /** The photo uploaded, but the consent record was not saved, so the cloud read stays off. */
    NOT_SAVED,
}

/**
 * incidents/{incidentId}/photoConsents/{sha256}: the family's yes to command reading that photo in
 * the cloud. Exactly these fields; the rules refuse any other shape, any update and a second create.
 */
data class PhotoConsentRecord(val storagePath: String, val cloudProcessing: ConsentMark, val createdByUid: String) {
    fun toMap(serverTime: Any): Map<String, Any?> = linkedMapOf(
        "storagePath" to storagePath, "cloudProcessing" to cloudProcessing.toMap(), "createdByUid" to createdByUid, "createdAt" to serverTime,
    )

    companion object {
        fun of(incidentId: String, sha256: String, consent: ConsentMark) =
            PhotoConsentRecord("photos/$incidentId/$sha256.jpg", consent, consent.byUid)
    }
}

fun interface PhotoConsentSink {
    suspend fun create(incidentId: String, sha256: String, record: PhotoConsentRecord)
}

sealed class PhotoOutcome {
    data class Uploaded(val path: String, val cloudRead: CloudRead = CloudRead.NOT_ASKED) : PhotoOutcome()
    data class Refused(val message: String) : PhotoOutcome()
    data class Failed(val message: String) : PhotoOutcome()
}

/**
 * Uploads a standardized family photo (JpegEncoder output) to
 * photos/{incidentId}/{sha256}.jpg. Only a JPEG under the 2 MB cap is sent.
 */
class PhotoUpload(
    private val bucket: PhotoBucket,
    private val consents: PhotoConsentSink? = null,
    private val worker: CoroutineDispatcher = Dispatchers.Default,
) {
    /**
     * [consent] is the family's tick for command's cloud read of this photo: its record is written
     * only after the photo uploads, and never without the tick.
     */
    suspend fun upload(incidentId: String, jpeg: ByteArray, consent: ConsentMark? = null): PhotoOutcome =
        withContext(worker) { uploadOnWorker(incidentId, jpeg, consent) }

    private suspend fun uploadOnWorker(incidentId: String, jpeg: ByteArray, consent: ConsentMark?): PhotoOutcome {
        if (jpeg.size < 2 || jpeg[0] != 0xFF.toByte() || jpeg[1] != 0xD8.toByte()) return PhotoOutcome.Refused("This is not a photo.")
        if (jpeg.size > MAX_PHOTO_BYTES) return PhotoOutcome.Refused("This photo is too large.")
        val sha = Hashes.sha256Hex(jpeg)
        val path = "photos/$incidentId/$sha.jpg"
        try {
            bucket.put(path, jpeg, "image/jpeg")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            return PhotoOutcome.Failed("The photo did not upload. Check the connection and try again.")
        }
        val sink = consents
        if (consent == null || sink == null) return PhotoOutcome.Uploaded(path, CloudRead.NOT_ASKED)
        return try {
            sink.create(incidentId, sha, PhotoConsentRecord.of(incidentId, sha, consent))
            PhotoOutcome.Uploaded(path, CloudRead.ALLOWED)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            PhotoOutcome.Uploaded(path, CloudRead.NOT_SAVED)
        }
    }
}

class FirestorePhotoConsentSink : PhotoConsentSink {
    override suspend fun create(incidentId: String, sha256: String, record: PhotoConsentRecord) {
        com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("incidents").document(incidentId)
            .collection("photoConsents").document(sha256)
            .set(record.toMap(com.google.firebase.firestore.FieldValue.serverTimestamp())).await()
    }
}

class FirebasePhotoBucket : PhotoBucket {
    override suspend fun put(path: String, bytes: ByteArray, contentType: String) {
        Firebase.storage.reference.child(path).putBytes(bytes, storageMetadata { this.contentType = contentType }).await()
    }
}
