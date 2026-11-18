package app.pointlastseen.family.ai

import com.google.firebase.Firebase
import app.pointlastseen.family.data.RouteRecord
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import com.google.firebase.storage.StorageException
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import java.util.Date

/** ClipReader's deps on Firebase: the reading cache, the clip in Storage, the AI Logic call. */
class FirebaseClipDeps(private val incidentId: String, private val ai: AiClient) : ClipDeps {
    private fun doc(sha256: String) =
        Firebase.firestore.collection("incidents").document(incidentId).collection("clipReadings").document(sha256)

    override suspend fun findReading(sha256: String): StoredClipReading? {
        val snap = doc(sha256).get().await()
        if (!snap.exists()) return null
        return ClipReadingDoc.fromMap(snap.data ?: return null) { (it as Timestamp).toDate().time }
    }

    override fun storagePath(sha256: String): String = "clips/$incidentId/$sha256.mp4"

    override suspend fun clipExists(sha256: String): Boolean = try {
        Firebase.storage.reference.child(storagePath(sha256)).metadata.await()
        true
    } catch (e: StorageException) {
        if (e.errorCode == StorageException.ERROR_OBJECT_NOT_FOUND) false else throw e
    }

    override suspend fun upload(sha256: String, bytes: ByteArray): String {
        val path = storagePath(sha256)
        Firebase.storage.reference.child(path).putBytes(bytes, storageMetadata { contentType = "video/mp4" }).await()
        return path
    }

    override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply = ai.readClip(bytes, mimeType)

    /**
     * Awaited, unlike other writes: the Storage rules refuse the clip until this record
     * exists on the server. Bounded, so a dropped link shows a failure, not a hang.
     */
    override suspend fun createConsentRecord(doc: StoredClipReading) {
        withTimeout(CONSENT_WRITE_TIMEOUT_MS) {
            doc(doc.sha256).set(ClipReadingDoc.consentRecord(doc, { Timestamp(Date(it)) }, FieldValue.serverTimestamp())).await()
        }
    }

    /** Not awaited (Global Constraints): Firestore sends it when the link allows. */
    override suspend fun completeReading(sha256: String, readingJson: String, route: RouteRecord) {
        doc(sha256).set(ClipReadingDoc.completion(readingJson, route), SetOptions.merge())
    }

    override fun nowMs(): Long = System.currentTimeMillis()

    companion object {
        const val CONSENT_WRITE_TIMEOUT_MS = 20_000L
    }
}
