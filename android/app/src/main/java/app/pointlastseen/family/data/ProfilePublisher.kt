package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore
import java.util.concurrent.atomic.AtomicInteger

/** Where the two profile documents go: incidents/{incidentId}/profile/{shared|command}. */
fun interface ProfileSink {
    fun write(incidentId: String, docId: String, data: Map<String, Any?>, onResult: (Throwable?) -> Unit)
}

/**
 * After "She's gone": the shared fields to profile/shared (readable by every member,
 * carried in packs) and the history to profile/command (command and family only).
 * Firestore rules work per document, so the split keeps history off searcher phones.
 */
class ProfilePublisher(private val sink: ProfileSink) {
    fun publish(incidentId: String, p: SubjectProfile, onDone: (Boolean) -> Unit) {
        val left = AtomicInteger(2)
        var ok = true
        val each: (Throwable?) -> Unit = { err ->
            if (err != null) ok = false
            if (left.decrementAndGet() == 0) onDone(ok)
        }
        sink.write(incidentId, "shared", Profiles.forSearchers(p).toMap(), each)
        sink.write(incidentId, "command", Profiles.forCommand(p).toMap(), each)
    }
}

class FirestoreProfileSink : ProfileSink {
    override fun write(incidentId: String, docId: String, data: Map<String, Any?>, onResult: (Throwable?) -> Unit) {
        Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document(docId)
            .set(data).addOnCompleteListener { onResult(it.exception) }
    }
}
