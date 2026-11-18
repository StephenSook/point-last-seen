package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.ClipDeps
import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.ai.ClipReader
import app.pointlastseen.family.ai.ClipRequest
import app.pointlastseen.family.ai.FirebaseClipDeps
import app.pointlastseen.family.ai.ModelReply
import app.pointlastseen.family.ai.Source
import app.pointlastseen.family.ai.StoredClipReading
import app.pointlastseen.family.config.RcValues
import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.Hashes
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.Source as DocSource
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.random.Random

/**
 * Live, run on request (drill incident): the clip reading rules with a real sighting and with a
 * takeover. The model is replaced by a fixture sighting, so the Firestore writes are the app's own
 * (FirebaseClipDeps) and the deployed rules judge them. Logs PLS-E2E lines with outcomes only.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class ClipRulesLiveTest {
    private fun log(s: String) = Log.i("PLS-E2E", s)
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val fixture = """
        {"personVisible":true,"firstSeen":"00:03","lastSeen":"00:12","entryEdge":"right","exitEdge":"left",
         "topColor":"blue","bottomColor":"black","topType":"coat","footwear":"sneakers","headwear":"none",
         "carriedItems":["bag"],"keyFrame":{"time":"00:05","box2d":[100,200,900,500]},
         "lighting":"day","legibility":"clear","evidence":"walks out of the left edge"}
    """.trimIndent()

    private suspend fun join(): JoinOutcome.Joined {
        val code = InstrumentationRegistry.getArguments().getString("plsJoinCode")
        assertNotNull("pass -Pandroid.testInstrumentationRunnerArguments.plsJoinCode", code)
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(code!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        return joined as JoinOutcome.Joined
    }

    private fun clip(name: String): ByteArray = TestPatternVideo.make(File(ctx.cacheDir, name), frames = 40 + Random.nextInt(20)).readBytes()

    private fun request(bytes: ByteArray, uid: String, at: Long) = ClipRequest(
        bytes = bytes, mimeType = "video/mp4", durationS = 30, clipStartMs = at - 60_000L, clockConfirmed = true, cameraFacingDeg = 90,
        consent = ClipConsent(Hashes.sha256Hex(bytes), ConsentMark(uid, at), ConsentMark(uid, at), ConsentMark(uid, at), null),
        killCloud = { false }, modelName = RcValues.DEFAULTS.clipModel, uploaderUid = uid,
    )

    /** The app's own Firestore writes, with the model call replaced by the fixture sighting. */
    private fun withFixture(incidentId: String): ClipDeps = object : ClipDeps by FirebaseClipDeps(incidentId, AiClient { RcValues.DEFAULTS }) {
        override suspend fun callModel(bytes: ByteArray, mimeType: String) = ModelReply(fixture, Source.IN_CLOUD, 1)
    }

    private suspend fun readingOf(incidentId: String, sha: String): Map<*, *>? {
        val doc = Firebase.firestore.collection("incidents").document(incidentId).collection("clipReadings").document(sha)
        for (i in 0 until 15) {
            (doc.get(DocSource.SERVER).await().get("reading") as Map<*, *>?)?.let { return it }
            delay(1_000)
        }
        return null
    }

    @Test fun aSightingCompletionPassesTheDeployedRules(): Unit = runBlocking {
        Firebase.auth.signOut()
        val joined = join()
        val bytes = clip("sighting.mp4")
        val out = ClipReader(withFixture(joined.incidentId)).read(request(bytes, joined.uid, System.currentTimeMillis()))
        log("sighting completion outcome=${out::class.simpleName}")
        assertTrue("outcome $out", out is ClipOutcome.Read)
        val reading = readingOf(joined.incidentId, Hashes.sha256Hex(bytes))
        assertNotNull("the completion was not accepted (no reading on the server)", reading)
        assertEquals(15, reading!!.size)
        assertEquals(true, reading["personVisible"])
        log("sighting completion accepted: reading has ${reading.size} keys")
    }

    @Test fun aStalledRecordIsTakenOverByAnotherFamilyMember(): Unit = runBlocking {
        Firebase.auth.signOut()
        val first = join()
        val bytes = clip("stalled.mp4")
        val sha = Hashes.sha256Hex(bytes)
        val firstDeps = withFixture(first.incidentId)
        val t0 = System.currentTimeMillis()
        // The first member's attempt stops after its consent record: no upload, no reading.
        firstDeps.createConsentRecord(
            StoredClipReading(
                sha256 = sha, storagePath = firstDeps.storagePath(sha), durationS = 30, clipStartMs = t0 - 60_000L, clockConfirmed = true,
                cameraFacingDeg = 90, readingJson = null, route = null, consent = request(bytes, first.uid, t0).consent,
                expiresAtMs = t0 + 32L * 24 * 3600 * 1000, createdAtMs = t0, createdByUid = first.uid,
            ),
        )
        log("stalled record written by the first member")
        Firebase.auth.signOut()
        val second = join()
        assertNotEquals(first.uid, second.uid)
        val out = ClipReader(withFixture(second.incidentId)).read(request(bytes, second.uid, System.currentTimeMillis()))
        log("takeover outcome=${out::class.simpleName}")
        assertTrue("outcome $out", out is ClipOutcome.Read)
        val doc = Firebase.firestore.collection("incidents").document(second.incidentId).collection("clipReadings").document(sha).get(DocSource.SERVER).await()
        assertEquals(second.uid, doc.getString("createdByUid"))
        assertNotNull(readingOf(second.incidentId, sha))
        log("stalled record taken over by the second member and completed")
    }
}
