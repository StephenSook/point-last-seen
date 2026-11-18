package app.pointlastseen.family.ai

import app.pointlastseen.family.core.Bearing
import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.CheckResult
import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ClipRules
import app.pointlastseen.family.core.SightingCheck
import app.pointlastseen.family.data.Hashes
import app.pointlastseen.family.data.RouteRecord
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A stored clip reading, clipReadings/{sha256} (spec section 7). */
data class StoredClipReading(
    val sha256: String,
    val storagePath: String,
    val durationS: Int,
    val clipStartMs: Long,
    val clockConfirmed: Boolean,
    val cameraFacingDeg: Int?,
    val readingJson: String,
    val route: RouteRecord?,
    val consent: ClipConsent,
    val expiresAtMs: Long,
    val createdAtMs: Long,
)

/** What ClipReader needs from Storage, Firestore and AI Logic. */
interface ClipDeps {
    suspend fun findReading(sha256: String): StoredClipReading?
    suspend fun upload(sha256: String, bytes: ByteArray): String
    suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply
    suspend fun storeReading(doc: StoredClipReading)
    fun nowMs(): Long
}

data class ClipRequest(
    val bytes: ByteArray,
    val mimeType: String,
    val durationS: Int,
    val clipStartMs: Long,
    val clockConfirmed: Boolean,
    val cameraFacingDeg: Int?,
    val consent: ClipConsent,
    /** Read live (Remote Config): checked before the read, before upload and before inference. */
    val killCloud: () -> Boolean,
    val modelName: String,
)

sealed class ClipOutcome {
    data class Refused(val message: String) : ClipOutcome()
    data object CouldNotRead : ClipOutcome()
    data object Failed : ClipOutcome()
    data class Read(
        val sha256: String,
        val reading: CameraSighting,
        val check: CheckResult?,
        val bearingDeg: Int?,
        val route: RouteRecord?,
        val cached: Boolean,
    ) : ClipOutcome()
}

/**
 * Reads a staged last-seen clip in the cloud (spec section 12.1). Size and the three
 * required consents are checked before anything leaves the phone. A clip already
 * read is never sent to the model again.
 */
class ClipReader(
    private val deps: ClipDeps,
    /** Hashing a clip of up to 14 MB three times is too slow for the main thread. */
    private val worker: CoroutineDispatcher = Dispatchers.Default,
) {

    suspend fun read(r: ClipRequest): ClipOutcome = withContext(worker) { readOnWorker(r) }

    private suspend fun readOnWorker(r: ClipRequest): ClipOutcome {
        ClipRules.sizeProblem(r.bytes.size.toLong())?.let { return ClipOutcome.Refused(it) }
        // Without the clip's length no reading can be checked, so nothing is sent.
        if (r.durationS <= 0) return ClipOutcome.Refused("The clip's length could not be read. Try another copy of the clip.")
        val sha = Hashes.sha256Hex(r.bytes)
        if (!ClipRules.consentComplete(r.consent, sha)) return ClipOutcome.Refused(NEEDS_CONSENT)
        if (r.killCloud()) return ClipOutcome.Refused(PAUSED)
        // The consent covers these exact bytes: check them again at each boundary they cross.
        val unchanged = { Hashes.sha256Hex(r.bytes) == sha }

        val bearingOf = { s: CameraSighting -> Bearing.fromExit(r.cameraFacingDeg, s.exitEdge) }
        try {
            deps.findReading(sha)?.let { hit ->
                val s = CameraSightingJson.parse(hit.readingJson) ?: return ClipOutcome.CouldNotRead
                val check = SightingCheck.check(s, hit.durationS)
                if (!check.ok) return ClipOutcome.CouldNotRead
                // No second model call, but the facing, clock and consents the family just
                // gave replace the stored ones, so a corrected facing takes effect.
                deps.storeReading(hit.copy(clipStartMs = r.clipStartMs, clockConfirmed = r.clockConfirmed, cameraFacingDeg = r.cameraFacingDeg, consent = r.consent))
                return ClipOutcome.Read(sha, check.cleaned, check, Bearing.fromExit(r.cameraFacingDeg, s.exitEdge), hit.route, cached = true)
            }
            if (!unchanged()) return ClipOutcome.Refused(NEEDS_CONSENT)
            if (r.killCloud()) return ClipOutcome.Refused(PAUSED)
            val path = deps.upload(sha, r.bytes)
            if (!unchanged()) return ClipOutcome.Refused(NEEDS_CONSENT)
            if (r.killCloud()) return ClipOutcome.Refused(PAUSED)
            val reply = deps.callModel(r.bytes, r.mimeType)
            val parsed = CameraSightingJson.parse(reply.text) ?: return ClipOutcome.CouldNotRead
            val check = SightingCheck.check(parsed, r.durationS)
            if (!check.ok) return ClipOutcome.CouldNotRead
            val now = deps.nowMs()
            val route = RouteRecord(
                platform = "android", path = if (reply.source == Source.ON_DEVICE) "on_device" else "cloud",
                stage = "sdk", model = r.modelName, reason = "sdk_only_in_cloud", latencyMs = reply.latencyMs,
                sdkReported = true, blocked = null, decidedAtMs = now,
            )
            deps.storeReading(
                StoredClipReading(
                    sha256 = sha, storagePath = path, durationS = r.durationS, clipStartMs = r.clipStartMs,
                    clockConfirmed = r.clockConfirmed, cameraFacingDeg = r.cameraFacingDeg,
                    readingJson = CameraSightingJson.toJson(check.cleaned), route = route, consent = r.consent,
                    expiresAtMs = now + READING_TTL_MS, createdAtMs = now,
                ),
            )
            return ClipOutcome.Read(sha, check.cleaned, check, bearingOf(check.cleaned), route, cached = false)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            return ClipOutcome.Failed
        }
    }

    companion object {
        const val READING_TTL_MS = 30L * 24 * 3600 * 1000
        const val PAUSED = "Clip reading is paused right now. Tell command about the clip."
        const val NEEDS_CONSENT =
            "Three consents are needed for this clip: the person in the clip, the owner of the footage, and cloud processing."
    }
}
