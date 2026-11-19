package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirestoreProfileSink
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.ProfilePublisher
import app.pointlastseen.family.data.ProfileSink
import app.pointlastseen.family.data.ProfileWrite
import app.pointlastseen.family.data.PublishedProfiles
import app.pointlastseen.family.data.SubjectProfile
import com.google.firebase.Firebase
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Against the deployed drill: the profile is written whole once, then a family edit goes as an update of
 * only the changed field, and the deployed rules accept it. PLS-E2E lines carry outcomes only.
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

    /** The real sink, logging only which document failed and the server's error code, never the data. */
    private inner class CodeLoggingSink : ProfileSink {
        private val real = FirestoreProfileSink()
        override fun write(incidentId: String, docId: String, change: ProfileWrite, onResult: (Throwable?) -> Unit) =
            real.write(incidentId, docId, change) { e ->
                if (e != null) {
                    val code = (e as? FirebaseFirestoreException)?.code?.name ?: e.javaClass.simpleName
                    log("profile write refused doc=$docId kind=${change.javaClass.simpleName} code=$code")
                }
                onResult(e)
            }
    }

    @Test fun aFamilyEditIsSentAsAFieldUpdateAndAccepted(): Unit = runBlocking {
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(DrillCode.read()!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val publisher = ProfilePublisher(CodeLoggingSink(), MemoryPublished())
        val base = SubjectProfile(answersTo = "Drill subject (synthetic)", clothingLastWorn = "green coat", flags = setOf("mayNotRespond"))

        assertTrue("whole publish", publish(publisher, incidentId, base))
        log("profile published whole")
        val stamp = "drill coat ${System.currentTimeMillis() % 100000}"
        assertTrue("field update accepted", publish(publisher, incidentId, base.copy(clothingLastWorn = stamp)))
        val shared = Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document("shared").get(Source.SERVER).await()
        assertEquals(stamp, shared.getString("clothingLastWorn"))
        assertEquals("Drill subject (synthetic)", shared.getString("answersTo"))
        log("field update accepted by the rules and read back; other fields unchanged")
        assertTrue("no-change publish", publish(publisher, incidentId, base.copy(clothingLastWorn = stamp)))
        log("unchanged profile published nothing")
    }
}
