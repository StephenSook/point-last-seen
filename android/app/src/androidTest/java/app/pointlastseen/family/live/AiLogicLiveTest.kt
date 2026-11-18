package app.pointlastseen.family.live

import android.net.TrafficStats
import android.os.Process
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.NoteMode
import app.pointlastseen.family.ai.Source
import app.pointlastseen.family.config.RcValues
import com.google.firebase.ai.type.FirebaseAIOnDeviceNotAvailableException
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Live: hybrid calls through Firebase AI Logic from this device, with App Check.
 * This app's own sent bytes (TrafficStats for its uid) are the request observer;
 * the consented cloud call is the positive control that proves the observer works.
 * Logs PLS-PROBE lines (status, source, latency, bytes) for the spike record.
 */
@OptIn(PublicPreviewAPI::class)
@RunWith(AndroidJUnit4::class)
class AiLogicLiveTest {
    private val client = AiClient { RcValues.DEFAULTS }
    private val note = "She used to walk to the old mill every Sunday morning."

    private fun sentBytes(): Long = TrafficStats.getUidTxBytes(Process.myUid())

    private fun settleAndRead(): Long {
        Thread.sleep(1500)
        return sentBytes()
    }

    @Test fun aConsentedPreferOnDeviceCallIsSeenLeavingThePhone(): Unit = runBlocking {
        val status = client.deviceModelStatus()
        val before = settleAndRead()
        val reply = client.familyNote.structure(NoteMode.PREFER_ON_DEVICE, FamilyNote.prompt(note))
        val sent = settleAndRead() - before
        Log.i("PLS-PROBE", "checkStatus=$status inferenceSource=${reply.source} latencyMs=${reply.latencyMs} sentBytes=$sent model=${RcValues.DEFAULTS.cloudModelAndroid}")
        assertTrue("TrafficStats unsupported on this device", before >= 0)
        assertNotNull("reply did not fit the note schema: ${reply.text}", FamilyNote.parse(reply.text, note))
        if (status != DeviceModelStatus.AVAILABLE) {
            assertEquals(Source.IN_CLOUD, reply.source)
            assertTrue("the observer saw only $sent bytes for a cloud call", sent > 1_000)
        }
    }

    @Test fun onlyOnDeviceNeverLeavesThePhone(): Unit = runBlocking {
        val status = client.deviceModelStatus()
        val before = settleAndRead()
        val result = runCatching { client.familyNote.structure(NoteMode.ONLY_ON_DEVICE, FamilyNote.prompt(note)) }
        val sent = settleAndRead() - before
        Log.i("PLS-PROBE", "ONLY_ON_DEVICE status=$status -> ${result.exceptionOrNull()?.javaClass?.simpleName ?: "source=" + result.getOrNull()?.source} sentBytes=$sent")
        if (status == DeviceModelStatus.AVAILABLE) {
            assertEquals(Source.ON_DEVICE, result.getOrThrow().source)
        } else {
            assertTrue("expected FirebaseAIOnDeviceNotAvailableException, got ${result.exceptionOrNull()}", result.exceptionOrNull() is FirebaseAIOnDeviceNotAvailableException)
        }
        assertTrue("ONLY_ON_DEVICE sent $sent bytes", sent < 300)
    }
}
