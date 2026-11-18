package app.pointlastseen.family.live

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File

/**
 * Encodes a short synthetic H.264 clip on the device: a grey field with a dark
 * block moving left to right. No person and no committed media; for live probes only.
 */
object TestPatternVideo {
    fun make(out: File, width: Int = 320, height: Int = 240, frames: Int = 40, fps: Int = 20): File {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            setInteger(MediaFormat.KEY_BIT_RATE, 400_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        val muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        var track = -1
        var muxing = false
        var sent = 0
        var done = false
        val info = MediaCodec.BufferInfo()
        while (!done) {
            if (sent <= frames) {
                val inIndex = codec.dequeueInputBuffer(10_000)
                if (inIndex >= 0) {
                    if (sent == frames) {
                        codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                    } else {
                        val image = requireNotNull(codec.getInputImage(inIndex))
                        val blockX = (sent * (width - 60)) / frames
                        for ((p, plane) in image.planes.withIndex()) {
                            val sub = if (p == 0) 1 else 2
                            val buf = plane.buffer
                            for (y in 0 until height / sub) for (x in 0 until width / sub) {
                                val inBlock = p == 0 && x in blockX until blockX + 60 && y in 90 until 150
                                buf.put(y * plane.rowStride + x * plane.pixelStride, if (p == 0) (if (inBlock) 30 else 160).toByte() else 128.toByte())
                            }
                        }
                        codec.queueInputBuffer(inIndex, 0, width * height * 3 / 2, sent * 1_000_000L / fps, 0)
                    }
                    sent++
                }
            }
            val outIndex = codec.dequeueOutputBuffer(info, 10_000)
            when {
                outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    track = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                    muxing = true
                }
                outIndex >= 0 -> {
                    val data = requireNotNull(codec.getOutputBuffer(outIndex))
                    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
                    if (info.size > 0 && muxing) muxer.writeSampleData(track, data, info)
                    codec.releaseOutputBuffer(outIndex, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) done = true
                }
            }
        }
        codec.stop()
        codec.release()
        muxer.stop()
        muxer.release()
        return out
    }
}
