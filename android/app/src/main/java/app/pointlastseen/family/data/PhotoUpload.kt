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

interface PhotoBucket {
    /** Whether an object is stored at [path]; throws when the check cannot run. */
    suspend fun exists(path: String): Boolean
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
    /** Another family member's consent record already allows it; only that member can withdraw it. */
    ALLOWED_BY_ANOTHER,
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

interface PhotoConsentSink {
    /** Who created the photo's consent record, or null when there is none. */
    suspend fun creatorOf(incidentId: String, sha256: String): String?
    suspend fun create(incidentId: String, sha256: String, record: PhotoConsentRecord)
}

sealed class PhotoOutcome {
    data class Uploaded(val path: String, val cloudRead: CloudRead = CloudRead.NOT_ASKED) : PhotoOutcome()
    data class Refused(val message: String) : PhotoOutcome()
    data class Failed(val message: String) : PhotoOutcome()
    /** The phone left the search before this photo's next write; nothing more was sent. */
    data object Left : PhotoOutcome()
}

/**
 * Uploads a standardized family photo (JpegEncoder output) to
 * photos/{incidentId}/{sha256}.jpg. Only a JPEG under the 2 MB cap is sent. Photos and their consent
 * records are create-only, so sharing the same photo again finds them and writes neither twice.
 */
class PhotoUpload(
    private val bucket: PhotoBucket,
    private val consents: PhotoConsentSink? = null,
    private val worker: CoroutineDispatcher = Dispatchers.Default,
    /** Where this phone lists the consents it made: written before the record's write starts, so a write cut short is still listed. */
    private val ledger: ConsentLedger? = null,
) {
    /**
     * [consent] is the family's tick for command's cloud read of this photo: its record is written
     * only after the photo uploads, and never without the tick. [stillJoined] is checked before the
     * upload and before the consent record; once the phone has left the search, nothing more is sent.
     */
    suspend fun upload(
        incidentId: String,
        jpeg: ByteArray,
        consent: ConsentMark? = null,
        stillJoined: StillJoined = StillJoined { true },
    ): PhotoOutcome = withContext(worker) { uploadOnWorker(incidentId, jpeg, consent, stillJoined) }

    private suspend fun uploadOnWorker(incidentId: String, jpeg: ByteArray, consent: ConsentMark?, stillJoined: StillJoined): PhotoOutcome {
        if (jpeg.size < 2 || jpeg[0] != 0xFF.toByte() || jpeg[1] != 0xD8.toByte()) return PhotoOutcome.Refused("This is not a photo.")
        if (jpeg.size > MAX_PHOTO_BYTES) return PhotoOutcome.Refused("This photo is too large.")
        val sha = Hashes.sha256Hex(jpeg)
        val path = "photos/$incidentId/$sha.jpg"
        if (!stillJoined.check()) return PhotoOutcome.Left
        try {
            // A check that cannot run proves neither, so it fails like an upload would.
            if (!bucket.exists(path)) bucket.put(path, jpeg, "image/jpeg")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            return PhotoOutcome.Failed("The photo did not upload. Check the connection and try again.")
        }
        val sink = consents
        if (consent == null || sink == null) return PhotoOutcome.Uploaded(path, CloudRead.NOT_ASKED)
        if (!stillJoined.check()) return PhotoOutcome.Left
        return try {
            when (sink.creatorOf(incidentId, sha)) {
                null -> {
                    ledger?.add(incidentId, sha)
                    // Listing it wrote to disk: check the join again just before the write starts.
                    if (!stillJoined.check()) {
                        ledger?.remove(incidentId, sha)
                        return PhotoOutcome.Left
                    }
                    try {
                        sink.create(incidentId, sha, PhotoConsentRecord.of(incidentId, sha, consent))
                    } catch (e: Exception) {
                        // Refused or failed: nothing to withdraw. Cancelled: the write may still land, so it stays listed.
                        if (e !is kotlinx.coroutines.CancellationException) ledger?.remove(incidentId, sha)
                        throw e
                    }
                    PhotoOutcome.Uploaded(path, CloudRead.ALLOWED)
                }
                consent.byUid -> {
                    ledger?.add(incidentId, sha)
                    PhotoOutcome.Uploaded(path, CloudRead.ALLOWED)
                }
                else -> PhotoOutcome.Uploaded(path, CloudRead.ALLOWED_BY_ANOTHER)
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            PhotoOutcome.Uploaded(path, CloudRead.NOT_SAVED)
        }
    }
}

class FirestorePhotoConsentSink : PhotoConsentSink {
    override suspend fun creatorOf(incidentId: String, sha256: String): String? =
        com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("incidents").document(incidentId)
            .collection("photoConsents").document(sha256).get(com.google.firebase.firestore.Source.SERVER).await()
            .takeIf { it.exists() }?.getString(CREATED_BY)

    /** Withdraws one record; the rules let only its creator delete it. */
    suspend fun delete(incidentId: String, sha256: String) {
        com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("incidents").document(incidentId)
            .collection("photoConsents").document(sha256).delete().await()
    }

    override suspend fun create(incidentId: String, sha256: String, record: PhotoConsentRecord) {
        com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("incidents").document(incidentId)
            .collection("photoConsents").document(sha256)
            .set(record.toMap(com.google.firebase.firestore.FieldValue.serverTimestamp())).await()
    }

    private companion object {
        const val CREATED_BY = "createdByUid"
    }
}

class FirebasePhotoBucket : PhotoBucket {
    override suspend fun exists(path: String): Boolean = try {
        Firebase.storage.reference.child(path).metadata.await()
        true
    } catch (e: com.google.firebase.storage.StorageException) {
        if (e.errorCode == com.google.firebase.storage.StorageException.ERROR_OBJECT_NOT_FOUND) false else throw e
    }

    override suspend fun put(path: String, bytes: ByteArray, contentType: String) {
        Firebase.storage.reference.child(path).putBytes(bytes, storageMetadata { this.contentType = contentType }).await()
    }
}
