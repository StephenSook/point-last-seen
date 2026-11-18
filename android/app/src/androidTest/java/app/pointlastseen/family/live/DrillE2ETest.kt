package app.pointlastseen.family.live

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.ai.ClipReader
import app.pointlastseen.family.ai.ClipRequest
import app.pointlastseen.family.ai.FirebaseClipDeps
import app.pointlastseen.family.config.RcValues
import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.JpegEncoder
import app.pointlastseen.family.data.EventWriter
import app.pointlastseen.family.data.Events
import app.pointlastseen.family.data.FamilySightingInput
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirebasePhotoBucket
import app.pointlastseen.family.data.FirestoreEventStore
import app.pointlastseen.family.data.FirestoreProfileSink
import app.pointlastseen.family.data.Hashes
import app.pointlastseen.family.data.IncidentInfo
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.PhotoOutcome
import app.pointlastseen.family.data.PhotoUpload
import app.pointlastseen.family.data.PrefsStore
import app.pointlastseen.family.data.ProfilePublisher
import app.pointlastseen.family.data.Session
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.data.WriteState
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.random.Random

/**
 * The family loop against the deployed project and the synthetic drill incident:
 * join with the family code (passed as the instrumentation argument plsJoinCode,
 * never logged), publish the profile, write a sighting and a duplicate of it, read a
 * device-made clip through the consent-first flow, and upload a photo. Logs only
 * PLS-E2E lines with outcomes, never the code, a token or a uid.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class DrillE2ETest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private fun log(s: String) = Log.i("PLS-E2E", s)

    @Test fun theFamilyLoopRunsAgainstTheDeployedProject(): Unit = runBlocking {
        val code = InstrumentationRegistry.getArguments().getString("plsJoinCode")
        assertNotNull("pass -Pandroid.testInstrumentationRunnerArguments.plsJoinCode", code)

        // 1. Join: the callable checks the code; the refreshed token carries the family claims.
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(code!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val uid = joined.uid
        log("join ok incident=$incidentId")

        // 2. The incident is readable with the claims and is a drill.
        val info = IncidentInfo.from(Firebase.firestore.collection("incidents").document(incidentId).get(Source.SERVER).await().data)
        assertEquals("drill", info?.mode)
        log("incident mode=${info?.mode} status=${info?.status} priorVersion=${info?.priorVersion}")

        // 3. Profile: shared and command documents.
        val published = CompletableDeferred<Boolean>()
        ProfilePublisher(FirestoreProfileSink()).publish(
            incidentId,
            SubjectProfile(answersTo = "Drill subject (synthetic)", clothingLastWorn = "blue coat", flags = setOf("mayNotRespond", "likelyToHide")),
        ) { published.complete(it) }
        assertTrue("profile publish", withTimeout(30_000) { published.await() })
        log("profile shared and command written")

        // 4. A sighting, then the same event again: create-only rules deny the copy, and
        //    the read-back shows the first copy landed, so it ends acknowledged.
        val session = Session(PrefsStore(ctx, "pls-e2e-${System.currentTimeMillis()}"))
        val writer = EventWriter(FirestoreEventStore())
        val loop = launch { writer.run() }
        val ectx = session.context(incidentId, uid, info?.priorVersion ?: 1L, System.currentTimeMillis())
        val sighting = Events.familySighting(
            FamilySightingInput(System.currentTimeMillis() - 10 * 60_000L, null, "Drill: by the mill gate", "n", "blue", "black", "", "", "Training drill inject"),
            ectx,
        )
        writer.submit(sighting)
        withTimeout(30_000) { writer.states.first { it[sighting.eventId] == WriteState.ACKNOWLEDGED } }
        log("sighting acknowledged")
        writer.retry(sighting.eventId)
        withTimeout(30_000) { writer.states.first { it[sighting.eventId] != WriteState.PENDING } }
        assertEquals(WriteState.ACKNOWLEDGED, writer.states.value[sighting.eventId])
        log("duplicate write denied and read back as acknowledged")
        loop.cancel()

        // 5. Clip: consent record first, upload, cloud read. The synthetic clip has no person,
        //    so the honest outcome is CouldNotRead; the record and the stored clip must exist.
        val clipFile = TestPatternVideo.make(File(ctx.cacheDir, "e2e.mp4"), frames = 40 + Random.nextInt(10))
        val bytes = clipFile.readBytes()
        val sha = Hashes.sha256Hex(bytes)
        val now = System.currentTimeMillis()
        val mark = ConsentMark(uid, now)
        val deps = FirebaseClipDeps(incidentId, AiClient { RcValues.DEFAULTS })
        val outcome = ClipReader(deps).read(
            ClipRequest(
                bytes = bytes, mimeType = "video/mp4", durationS = 2, clipStartMs = now - 60_000L, clockConfirmed = true,
                cameraFacingDeg = 90, consent = ClipConsent(sha, mark, mark, mark, null), killCloud = { false },
                modelName = RcValues.DEFAULTS.clipModel, uploaderUid = uid,
            ),
        )
        log("clip outcome=${outcome::class.simpleName}")
        assertTrue("clip outcome $outcome", outcome is ClipOutcome.CouldNotRead || outcome is ClipOutcome.Read)
        val record = Firebase.firestore.collection("incidents").document(incidentId).collection("clipReadings").document(sha).get(Source.SERVER).await()
        assertEquals(uid, record.getString("createdByUid"))
        assertTrue("clip stored", deps.clipExists(sha))
        log("clip consent record and stored clip present")

        // 6. Photo: a 1536 px JPEG with no EXIF, under its hash.
        val bmp = Bitmap.createBitmap(2400, 1600, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(Random.nextInt(255), 120, 80)) }
        val photoFile = File(ctx.cacheDir, "e2e.jpg").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) } }
        val jpeg = JpegEncoder.encode(ctx.contentResolver, Uri.fromFile(photoFile))
        val photo = PhotoUpload(FirebasePhotoBucket()).upload(incidentId, jpeg)
        assertTrue("photo $photo", photo is PhotoOutcome.Uploaded)
        log("photo uploaded bytes=${jpeg.size}")
    }
}
