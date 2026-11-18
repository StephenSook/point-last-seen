package app.pointlastseen.family.core

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.File

@RunWith(AndroidJUnit4::class)
class JpegEncoderTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    private fun sample(w: Int, h: Int, orientation: Int = ExifInterface.ORIENTATION_NORMAL): Uri {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(40, 90, 160)) }
        val f = File(context.cacheDir, "sample-${w}x$h-$orientation.jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        ExifInterface(f.absolutePath).apply {
            setLatLong(33.7490, -84.3880)
            setAttribute(ExifInterface.TAG_MAKE, "TestCam")
            setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2026:11:17 21:00:00")
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        assertTrue(ExifInterface(f.absolutePath).latLong != null)
        return Uri.fromFile(f)
    }

    private fun size(b: ByteArray): Pair<Int, Int> {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(b, 0, b.size, o)
        return o.outWidth to o.outHeight
    }

    private fun maxSide(b: ByteArray) = size(b).let { maxOf(it.first, it.second) }
    private fun exifGps(b: ByteArray): DoubleArray? = ExifInterface(ByteArrayInputStream(b)).latLong

    @Test fun encodeGivesJpegUnder1536WithNoExif() {
        val b = JpegEncoder.encode(context.contentResolver, sample(3000, 2000))
        assertEquals(0xFF.toByte(), b[0])
        assertEquals(0xD8.toByte(), b[1])
        assertTrue(maxSide(b) <= 1536)
        assertNull(exifGps(b))
        val exif = ExifInterface(ByteArrayInputStream(b))
        assertNull(exif.getAttribute(ExifInterface.TAG_MAKE))
        assertNull(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL))
    }

    @Test fun theLongSideBecomes1536AndTheAspectHolds() {
        val (w, h) = size(JpegEncoder.encode(context.contentResolver, sample(3000, 2000)))
        assertEquals(1536, w)
        assertEquals(1024, h)
    }

    @Test fun orientationIsAppliedToThePixels() {
        val (w, h) = size(JpegEncoder.encode(context.contentResolver, sample(3000, 2000, ExifInterface.ORIENTATION_ROTATE_90)))
        assertEquals(1024, w)
        assertEquals(1536, h)
    }

    @Test fun aSmallPhotoIsNotEnlarged() {
        val (w, h) = size(JpegEncoder.encode(context.contentResolver, sample(800, 600)))
        assertEquals(800, w)
        assertEquals(600, h)
    }

    @Test fun theResultFitsThePhotoCap() {
        assertTrue(JpegEncoder.encode(context.contentResolver, sample(4000, 3000)).size <= MAX_PHOTO_BYTES)
    }
}
