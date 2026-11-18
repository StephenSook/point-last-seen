package app.pointlastseen.family.core

/** Largest clip sent inline: base64 grows it by a third, under the 20 MB request limit. */
const val MAX_CLIP_BYTES: Long = 14_000_000L

/** Who consented, and when. */
data class ConsentMark(val byUid: String, val atMs: Long) {
    fun toMap(): Map<String, Any> = mapOf("byUid" to byUid, "atMs" to atMs)
}

/**
 * Four separate consents for one clip, bound to that clip's SHA-256. Public use is
 * needed only for a clip shown in the film or on the judge page. The hash is the
 * clipReadings document id, so it is not repeated inside the stored consent map.
 */
data class ClipConsent(
    val clipSha256: String,
    val personInClip: ConsentMark?,
    val footageOwner: ConsentMark?,
    val cloudProcessing: ConsentMark?,
    val publicUse: ConsentMark?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "personInClip" to personInClip?.toMap(),
        "footageOwner" to footageOwner?.toMap(),
        "cloudProcessing" to cloudProcessing?.toMap(),
        "publicUse" to publicUse?.toMap(),
    )
}

object ClipRules {
    fun base64Size(bytes: Long): Long = (bytes + 2) / 3 * 4

    /** A message for a clip that cannot be sent, or null when its size is fine. */
    fun sizeProblem(bytes: Long): String? = when {
        bytes <= 0L -> "This clip is empty."
        bytes > MAX_CLIP_BYTES -> "This clip is larger than 14,000,000 bytes. Trim it and try again."
        else -> null
    }

    /** The three required consents, given for exactly these bytes. */
    fun consentComplete(c: ClipConsent, clipSha256: String): Boolean =
        c.clipSha256 == clipSha256 && c.personInClip != null && c.footageOwner != null && c.cloudProcessing != null
}
