package app.pointlastseen.family.data

import java.nio.ByteBuffer
import java.security.MessageDigest

object Hashes {
    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

/**
 * Event ids (spec section 8): the first 16 bytes, as 32 hex characters, of SHA-256
 * over incidentId, deviceId and decimal seq, each a 4-byte big-endian length
 * followed by its UTF-8 bytes. Fields are never joined with a separator.
 */
object EventIds {
    fun eventId(incidentId: String, deviceId: String, seq: Long): String {
        val md = MessageDigest.getInstance("SHA-256")
        for (field in listOf(incidentId, deviceId, seq.toString())) {
            val b = field.toByteArray(Charsets.UTF_8)
            md.update(ByteBuffer.allocate(4).putInt(b.size).array())
            md.update(b)
        }
        return md.digest().copyOf(16).joinToString("") { "%02x".format(it) }
    }
}
