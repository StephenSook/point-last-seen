package app.pointlastseen.family.ai

import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.firestore.firestore
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.tasks.await
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

    override suspend fun upload(sha256: String, bytes: ByteArray): String {
        val path = "clips/$incidentId/$sha256.mp4"
        Firebase.storage.reference.child(path).putBytes(bytes, storageMetadata { contentType = "video/mp4" }).await()
        return path
    }

    override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply = ai.readClip(bytes, mimeType)

    /**
     * Not awaited (Global Constraints: Firestore writes on the phone are never awaited):
     * with the link down after the model answers, the card still shows and Firestore
     * sends the reading when the link returns.
     */
    override suspend fun storeReading(doc: StoredClipReading) {
        doc(doc.sha256).set(ClipReadingDoc.toMap(doc) { Timestamp(Date(it)) })
    }

    override fun nowMs(): Long = System.currentTimeMillis()
}
