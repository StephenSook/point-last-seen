package app.pointlastseen.family.core

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.live.TestPatternVideo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ClipFileTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val clip by lazy { Uri.fromFile(TestPatternVideo.make(File(ctx.cacheDir, "clipfile.mp4"))) }

    @Test fun readsAClipUpToTheLimit() {
        val all = ClipFile.readUpTo(ctx.contentResolver, clip, 14_000_001L)!!
        assertEquals(File(ctx.cacheDir, "clipfile.mp4").length(), all.size.toLong())
        assertEquals(100, ClipFile.readUpTo(ctx.contentResolver, clip, 100L)!!.size)
    }

    @Test fun anUnreadableUriGivesNullInsteadOfThrowing() {
        assertNull(ClipFile.readUpTo(ctx.contentResolver, Uri.fromFile(File(ctx.cacheDir, "missing.mp4")), 100L))
        assertNull(ClipFile.readUpTo(ctx.contentResolver, Uri.parse("content://no.such.provider/x"), 100L))
    }

    @Test fun durationAndKeyFrameAreRead() {
        assertEquals(2, ClipFile.durationSeconds(ctx, clip))
        assertNotNull(ClipFile.frameAt(ctx, clip, 1))
    }

    @Test fun somethingThatIsNotAVideoHasNoDuration() {
        val f = File(ctx.cacheDir, "not-video.mp4").apply { writeText("hello") }
        assertEquals(0, ClipFile.durationSeconds(ctx, Uri.fromFile(f)))
        assertNull(ClipFile.frameAt(ctx, Uri.fromFile(f), 0))
    }
}
