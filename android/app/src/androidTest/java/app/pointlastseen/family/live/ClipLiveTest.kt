package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.CameraSightingJson
import app.pointlastseen.family.ai.Source
import app.pointlastseen.family.config.RcValues
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Live: one cloud video call (spike S13's second half) with a synthetic clip made on the device. */
@RunWith(AndroidJUnit4::class)
class ClipLiveTest {
    @Test fun aCloudVideoCallReturnsAnObjectInTheClipSchema(): Unit = runBlocking {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val clip = TestPatternVideo.make(File(ctx.cacheDir, "pattern.mp4"))
        val bytes = clip.readBytes()
        assertTrue("encoded clip is ${bytes.size} bytes", bytes.size > 1_000)
        val reply = AiClient { RcValues.DEFAULTS }.readClip(bytes, "video/mp4")
        val reading = CameraSightingJson.parse(reply.text)
        Log.i("PLS-PROBE", "clip bytes=${bytes.size} inferenceSource=${reply.source} latencyMs=${reply.latencyMs} parsed=${reading != null} personVisible=${reading?.personVisible} model=${RcValues.DEFAULTS.clipModel}")
        assertEquals(Source.IN_CLOUD, reply.source)
        assertNotNull("reply was not a CameraSighting object: ${reply.text}", reading)
    }
}
