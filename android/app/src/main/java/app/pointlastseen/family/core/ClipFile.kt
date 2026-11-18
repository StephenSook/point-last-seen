package app.pointlastseen.family.core

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.ByteArrayOutputStream

/**
 * File access for a picked or shared clip. Every call is guarded: an unreadable
 * URI (a lapsed grant, a cloud-only gallery item offline) gives null or 0 instead
 * of crashing. MediaMetadataRetriever is released in finally: it only implements
 * AutoCloseable from API 29, and the app runs from API 26.
 */
object ClipFile {
    fun readUpTo(resolver: ContentResolver, uri: Uri, limit: Long): ByteArray? = try {
        resolver.openInputStream(uri)?.use { s ->
            val out = ByteArrayOutputStream()
            val buf = ByteArray(64 * 1024)
            var total = 0L
            while (total < limit) {
                val n = s.read(buf, 0, minOf(buf.size.toLong(), limit - total).toInt())
                if (n < 0) break
                out.write(buf, 0, n)
                total += n
            }
            out.toByteArray()
        }
    } catch (e: Exception) {
        null
    }

    /** Whole seconds, rounded up; 0 when the length cannot be read. */
    fun durationSeconds(context: Context, uri: Uri): Int = withRetriever(context, uri, 0) { r ->
        val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        ((ms + 999) / 1000).toInt()
    }

    fun frameAt(context: Context, uri: Uri, seconds: Int): Bitmap? =
        withRetriever(context, uri, null) { r -> r.getFrameAtTime(seconds * 1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST) }

    private fun <T> withRetriever(context: Context, uri: Uri, fallback: T, block: (MediaMetadataRetriever) -> T): T {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(context, uri)
            block(r)
        } catch (e: Exception) {
            fallback
        } finally {
            runCatching { r.release() }
        }
    }
}
