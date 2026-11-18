package app.pointlastseen.family.data

import java.security.MessageDigest

object Hashes {
    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

/**
 * Event ids, in the shared framing the Firestore rules verify: for each field
 * (incidentId, deviceId, decimal seq) the decimal UTF-8 byte length, ":", then
 * the value; SHA-256 over the joined UTF-8 string; the first 32 lowercase hex
 * characters. ("ab", "c", 1) hashes "2:ab1:c1:1". The length prefixes keep
 * ("ab", "c") and ("a", "bc") apart.
 */
object EventIds {
    fun eventId(incidentId: String, deviceId: String, seq: Long): String {
        val framed = listOf(incidentId, deviceId, seq.toString())
            .joinToString("") { "${it.toByteArray(Charsets.UTF_8).size}:$it" }
        return Hashes.sha256Hex(framed.toByteArray(Charsets.UTF_8)).substring(0, 32)
    }
}
