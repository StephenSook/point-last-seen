package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirestoreProfileSink
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.ProfilePublisher
import app.pointlastseen.family.data.ProfileSink
import app.pointlastseen.family.data.StillJoined
import app.pointlastseen.family.data.ProfileWrite
import app.pointlastseen.family.data.PublishedProfiles
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.data.TrackingAids
import com.google.firebase.Firebase
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Against the deployed drill: a phone's first publish, then family edits as field updates, and the deployed rules
 * accept them. The drill incident seeds other searches, so each test puts back every profile field it changed, in a
 * finally (a field that was absent is deleted). PLS-E2E lines carry outcomes only.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class ProfileFieldUpdateLiveTest {
    private fun log(s: String) = Log.i("PLS-E2E", s)

    private class MemoryPublished : PublishedProfiles {
        val m = mutableMapOf<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, json: String) { m[key] = json }
    }

    private suspend fun publish(publisher: ProfilePublisher, incidentId: String, p: SubjectProfile): Boolean {
        val done = CompletableDeferred<Boolean>()
        publisher.publish(incidentId, p) { done.complete(it) }
        return withTimeout(30_000) { done.await() }
    }

    private fun profileDoc(incidentId: String, docId: String) =
        Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document(docId)

    /** Joins the drill, runs [block], and then puts profile/shared and profile/command back as they were. */
    private fun withRestoredProfile(block: suspend (incidentId: String) -> Unit): Unit = runBlocking {
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(DrillCode.read()!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val before = listOf("shared", "command").associateWith { profileDoc(incidentId, it).get(Source.SERVER).await().data }
        try {
            block(incidentId)
        } finally {
            withContext(NonCancellable) {
                for ((docId, was) in before) {
                    val now = profileDoc(incidentId, docId).get(Source.SERVER).await().data ?: continue
                    if (was == null) { log("restore: profile/$docId did not exist before the test; left as written"); continue }
                    val back = (now.keys + was.keys).filter { now[it] != was[it] }
                        .associateWith { k -> if (was.containsKey(k)) was[k] else FieldValue.delete() }
                    if (back.isNotEmpty()) withTimeout(30_000) { profileDoc(incidentId, docId).update(back).await() }
                    log("restore: profile/$docId, ${back.size} field(s) put back")
                }
            }
        }
    }

    /** The real sink, logging only which document failed and the server's error code, never the data. */
    private inner class CodeLoggingSink : ProfileSink {
        private val real = FirestoreProfileSink()
        override fun write(incidentId: String, docId: String, change: ProfileWrite, stillJoined: StillJoined, onResult: (Throwable?) -> Unit) =
            real.write(incidentId, docId, change, stillJoined) { e ->
                if (e != null) {
                    val code = (e as? FirebaseFirestoreException)?.code?.name ?: e.javaClass.simpleName
                    log("profile write refused doc=$docId kind=${change.javaClass.simpleName} code=$code")
                }
                onResult(e)
            }
    }

    @Test fun aFamilyEditIsSentAsAFieldUpdateAndAccepted() = withRestoredProfile { incidentId ->
        val publisher = ProfilePublisher(CodeLoggingSink(), MemoryPublished())
        val base = SubjectProfile(answersTo = "Drill subject (synthetic)", clothingLastWorn = "green coat", flags = setOf("mayNotRespond"))

        val doc = Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document("shared")
        // The drill's document persists between runs, so this phone's first publish adds only what it lacks.
        assertTrue("first publish", publish(publisher, incidentId, base))
        log("profile published (first publish of this phone)")
        val before = doc.get(Source.SERVER).await()
        val stamp = "drill coat ${System.currentTimeMillis() % 100000}"
        assertTrue("field update accepted", publish(publisher, incidentId, base.copy(clothingLastWorn = stamp)))
        val shared = doc.get(Source.SERVER).await()
        assertEquals(stamp, shared.getString("clothingLastWorn"))
        assertEquals(before.getString("answersTo"), shared.getString("answersTo"))
        log("field update accepted by the rules and read back; other fields unchanged")
        assertTrue("no-change publish", publish(publisher, incidentId, base.copy(clothingLastWorn = stamp)))
        log("unchanged profile published nothing")
    }

    /** An answered tracking question is accepted as a field update and reads back, then changes to none; needs the trackingAids rules live. */
    @Test fun anAnsweredTrackingQuestionIsAcceptedAndReadsBack() = withRestoredProfile { incidentId ->
        val publisher = ProfilePublisher(CodeLoggingSink(), MemoryPublished())
        val unanswered = SubjectProfile(answersTo = "Drill subject (synthetic)", flags = setOf("mayNotRespond"))
        val base = unanswered.copy(trackingAids = TrackingAids(listOf("gps_tracker"), "In his coat pocket"))
        val shared = Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document("shared")

        assertTrue("first publish, unanswered", publish(publisher, incidentId, unanswered))
        assertTrue("tracking answer as a field update", publish(publisher, incidentId, base))
        assertEquals(mapOf("aids" to listOf("gps_tracker"), "note" to "In his coat pocket"), shared.get(Source.SERVER).await().get("trackingAids"))
        log("tracking aids accepted as a field update and read back")
        val none = base.copy(trackingAids = TrackingAids(emptyList(), ""))
        assertTrue("field update to none", publish(publisher, incidentId, none))
        assertEquals(mapOf("aids" to emptyList<String>(), "note" to ""), shared.get(Source.SERVER).await().get("trackingAids"))
        log("tracking aids changed to none by a field update and read back")
    }

    /**
     * A phone's first publish (a reinstall, a second family phone) keeps what the document already holds: here an
     * edited name and a tracking answer written on the server survive a profile that differs on the name and never
     * answered the tracking question.
     */
    @Test fun aFirstPublishKeepsWhatTheDocumentHolds() = withRestoredProfile { incidentId ->
        val shared = Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document("shared")
        val base = SubjectProfile(answersTo = "Drill subject (synthetic)", flags = setOf("mayNotRespond"))
        assertTrue("the document exists", publish(ProfilePublisher(CodeLoggingSink(), MemoryPublished()), incidentId, base))
        // Edits written on the server, as command or another phone would, field by field.
        val edited = "Drill subject, edited (synthetic) ${System.currentTimeMillis() % 100000}"
        val aid = listOf("medicalert_id", "gps_tracker", "project_lifesaver")[(System.currentTimeMillis() % 3).toInt()]
        withTimeout(30_000) { shared.update(mapOf("answersTo" to edited, "trackingAids" to mapOf("aids" to listOf(aid), "note" to ""))).await() }
        // A fresh install has no record of what it published, so this is its first publish of the document.
        assertTrue("fresh install publishes", publish(ProfilePublisher(CodeLoggingSink(), MemoryPublished()), incidentId, base))
        val doc = shared.get(Source.SERVER).await()
        assertEquals(edited, doc.getString("answersTo"))
        assertEquals(mapOf("aids" to listOf(aid), "note" to ""), doc.get("trackingAids"))
        log("a first publish kept the edited name and the tracking answer it did not send")
    }
}
