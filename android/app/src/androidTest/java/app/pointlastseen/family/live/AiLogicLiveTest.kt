package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.NoteMode
import app.pointlastseen.family.ai.Source
import app.pointlastseen.family.config.RcValues
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Live: one hybrid call through Firebase AI Logic from this device, with App Check.
 * Logs PLS-PROBE lines (status, source, latency) for the spike record.
 */
@RunWith(AndroidJUnit4::class)
class AiLogicLiveTest {
    private val client = AiClient { RcValues.DEFAULTS }
    private val note = "She used to walk to the old mill every Sunday morning."

    @Test fun preferOnDeviceAnswersWithAReportedSourceAndAValidReading(): Unit = runBlocking {
        val status = client.deviceModelStatus()
        val reply = client.familyNote.structure(NoteMode.PREFER_ON_DEVICE, FamilyNote.prompt(note))
        Log.i("PLS-PROBE", "checkStatus=$status inferenceSource=${reply.source} latencyMs=${reply.latencyMs} model=${RcValues.DEFAULTS.cloudModelAndroid}")
        if (status != DeviceModelStatus.AVAILABLE) assertEquals(Source.IN_CLOUD, reply.source)
        val reading = FamilyNote.parse(reply.text, note)
        assertNotNull("reply did not fit the note schema: ${reply.text}", reading)
        Log.i("PLS-PROBE", "reading kind=${reading!!.kind} label=${reading.label}")
    }

    @Test fun onlyOnDeviceWithNoLocalModelFailsInsteadOfCallingTheCloud(): Unit = runBlocking {
        val status = client.deviceModelStatus()
        if (status == DeviceModelStatus.AVAILABLE) return@runBlocking
        val result = runCatching { client.familyNote.structure(NoteMode.ONLY_ON_DEVICE, FamilyNote.prompt(note)) }
        Log.i("PLS-PROBE", "ONLY_ON_DEVICE with status=$status -> ${result.exceptionOrNull()?.javaClass?.simpleName ?: "reply source=" + result.getOrNull()?.source}")
        assertTrue("ONLY_ON_DEVICE answered without a local model", result.isFailure)
    }
}
