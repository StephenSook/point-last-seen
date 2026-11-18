package app.pointlastseen.family.core

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** Storage rule for family photos (spec section 7). */
const val MAX_PHOTO_BYTES: Int = 2_000_000

/**
 * Standardizes a family photo: JPEG, long side at most 1536 px, EXIF orientation
 * applied to the pixels, and no metadata (Bitmap.compress writes none, so GPS,
 * camera and time tags are gone).
 */
object JpegEncoder {
    fun encode(resolver: ContentResolver, uri: Uri, maxPx: Int = 1536, quality: Int = 90): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open(resolver, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "This file is not a photo." }

        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxPx) sample *= 2
        val decoded = open(resolver, uri).use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: error("This photo could not be read.")

        val orientation = open(resolver, uri).use {
            ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(270f); m.postScale(-1f, 1f) }
        }
        val longSide = max(decoded.width, decoded.height)
        if (longSide > maxPx) {
            val s = maxPx.toFloat() / longSide
            m.postScale(s, s)
        }
        val out = if (m.isIdentity) decoded else {
            val t = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true)
            if (t !== decoded) decoded.recycle()
            t
        }
        // Rounding in createBitmap can leave the long side one pixel off; pin it exactly.
        val fixed = pinLongSide(out, maxPx)

        var q = quality
        while (true) {
            val bytes = ByteArrayOutputStream().use { bos ->
                fixed.compress(Bitmap.CompressFormat.JPEG, q, bos)
                bos.toByteArray()
            }
            if (bytes.size <= MAX_PHOTO_BYTES || q <= 50) {
                fixed.recycle()
                return bytes
            }
            q -= 10
        }
    }

    private fun pinLongSide(b: Bitmap, maxPx: Int): Bitmap {
        val long = max(b.width, b.height)
        if (long <= maxPx) return b
        val s = maxPx.toFloat() / long
        val w = (b.width * s).roundToInt().coerceAtMost(maxPx)
        val h = (b.height * s).roundToInt().coerceAtMost(maxPx)
        val t = Bitmap.createScaledBitmap(b, w, h, true)
        if (t !== b) b.recycle()
        return t
    }

    private fun open(resolver: ContentResolver, uri: Uri) =
        resolver.openInputStream(uri) ?: error("This photo could not be opened.")
}
