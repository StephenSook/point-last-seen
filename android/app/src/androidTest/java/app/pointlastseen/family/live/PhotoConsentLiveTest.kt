package app.pointlastseen.family.live

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.JpegEncoder
import app.pointlastseen.family.data.CloudRead
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirebasePhotoBucket
import app.pointlastseen.family.data.FirestorePhotoConsentSink
import app.pointlastseen.family.data.Hashes
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.PhotoConsentRecord
import app.pointlastseen.family.data.PhotoOutcome
import app.pointlastseen.family.data.PhotoUpload
import com.google.firebase.Firebase
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.random.Random

/**
 * Against the deployed drill: a photo uploaded with the family's tick gets its consent record, a
 * second create of that record is refused, and a photo uploaded without the tick gets none.
 * PLS-E2E lines carry outcomes only, never the code, a token or a uid.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class PhotoConsentLiveTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private fun log(s: String) = Log.i("PLS-E2E", s)

    private fun photo(name: String): ByteArray {
        val bmp = Bitmap.createBitmap(2400, 1600, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(Random.nextInt(255), Random.nextInt(255), 80)) }
        val f = File(ctx.cacheDir, name).apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) } }
        return JpegEncoder.encode(ctx.contentResolver, Uri.fromFile(f))
    }

    @Test fun aTickedPhotoGetsItsRecordOnceAndAnUntickedOneNone(): Unit = runBlocking {
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(DrillCode.read()!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val uid = joined.uid
        log("join ok incident=$incidentId")
        val consents = Firebase.firestore.collection("incidents").document(incidentId).collection("photoConsents")
        val upload = PhotoUpload(FirebasePhotoBucket(), FirestorePhotoConsentSink())

        // 1. With the tick: uploaded, then its record is written and reads back in the ruled shape.
        val ticked = photo("ticked.jpg")
        val tickedSha = Hashes.sha256Hex(ticked)
        val mark = ConsentMark(uid, System.currentTimeMillis())
        val out = withTimeout(60_000) { upload.upload(incidentId, ticked, mark) }
        assertEquals(PhotoOutcome.Uploaded("photos/$incidentId/$tickedSha.jpg", CloudRead.ALLOWED), out)
        val doc = consents.document(tickedSha).get(Source.SERVER).await()
        assertTrue(doc.exists())
        assertEquals("photos/$incidentId/$tickedSha.jpg", doc.getString("storagePath"))
        assertEquals(uid, doc.getString("createdByUid"))
        assertEquals(uid, doc.getString("cloudProcessing.byUid"))
        assertEquals(mark.atMs, doc.getLong("cloudProcessing.atMs"))
        assertNotNull(doc.getTimestamp("createdAt"))
        assertEquals(setOf("storagePath", "cloudProcessing", "createdByUid", "createdAt"), doc.data!!.keys)
        log("ticked photo: record accepted, fields as ruled")

        // 2. A second create of the same record is refused (create-only).
        val again = runCatching { withTimeout(30_000) { FirestorePhotoConsentSink().create(incidentId, tickedSha, PhotoConsentRecord.of(incidentId, tickedSha, mark)) } }
        assertTrue("re-create must be refused", again.isFailure)
        log("re-create refused: ${again.exceptionOrNull()?.javaClass?.simpleName}")

        // 2b. Withdrawal: the creator deletes the record, and it is gone from the server.
        withTimeout(30_000) { FirestorePhotoConsentSink().delete(incidentId, tickedSha) }
        assertFalse(consents.document(tickedSha).get(Source.SERVER).await().exists())
        log("withdrawn: the creator deleted the record")

        // 3. Without the tick: uploaded, and no record exists for it.
        val plain = photo("plain.jpg")
        val plainSha = Hashes.sha256Hex(plain)
        val out2 = withTimeout(60_000) { upload.upload(incidentId, plain, consent = null) }
        assertEquals(PhotoOutcome.Uploaded("photos/$incidentId/$plainSha.jpg", CloudRead.NOT_ASKED), out2)
        assertFalse(consents.document(plainSha).get(Source.SERVER).await().exists())
        log("unticked photo: uploaded, no record")

        // 4. The same photo shared again: Storage is create-only, so it is found and not uploaded twice.
        val out3 = withTimeout(60_000) { upload.upload(incidentId, plain, consent = null) }
        assertEquals(PhotoOutcome.Uploaded("photos/$incidentId/$plainSha.jpg", CloudRead.NOT_ASKED), out3)
        log("same photo shared again: found in Storage, no second upload")
    }
}
