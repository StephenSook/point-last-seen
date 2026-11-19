package app.pointlastseen.family.ai

import app.pointlastseen.family.core.EvidenceScreen
import app.pointlastseen.family.core.PhoneNumbers
import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.data.SignIn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** How the SDK may route a note: on this phone only, or on this phone with the cloud as fallback. */
enum class NoteMode { ONLY_ON_DEVICE, PREFER_ON_DEVICE }

/** The model call behind FamilyNote; AiClient builds it with OnDeviceConfig. */
fun interface NoteModel {
    suspend fun structure(mode: NoteMode, prompt: String): ModelReply
}

class NoteEnv(
    val status: DeviceModelStatus,
    val cloudConsent: Boolean,
    val killCloud: Boolean,
    val nowMs: () -> Long,
    val modelName: String,
)

/** What a remembered thing becomes: a place, an old address, a past wandering spot, or clothing. */
data class FamilyNoteReading(val kind: String, val label: String, val summary: String, val evidenceQuote: String) {
    companion object {
        val KINDS = listOf("place", "address", "wandering", "clothing")
    }
}

sealed class NoteOutcome {
    data object NeedsConsent : NoteOutcome()
    data object FillByHand : NoteOutcome()
    data object PossibleEvidence : NoteOutcome()
    data object Invalid : NoteOutcome()
    data object Failed : NoteOutcome()
    data class Read(val reading: FamilyNoteReading, val route: RouteRecord, val cleanedNote: String) : NoteOutcome()
}

/**
 * "I remembered something": a typed note structured into a closed schema with the
 * SDK's hybrid mode. Without the family's cloud consent the only route is this
 * phone's own model; with no local model and no consent, nothing is sent.
 */
class FamilyNote(private val model: NoteModel, private val screen: EvidenceScreen, private val signIn: SignIn) {

    suspend fun read(note: String, env: NoteEnv): NoteOutcome {
        val cleaned = PhoneNumbers.remove(note.trim())
        if (cleaned.isEmpty() || cleaned.length > MAX_NOTE) return NoteOutcome.Invalid
        if (screen.isPossibleEvidence(cleaned)) return NoteOutcome.PossibleEvidence
        val local = env.status == DeviceModelStatus.AVAILABLE
        val wanted = when {
            local && (env.killCloud || !env.cloudConsent) -> NoteMode.ONLY_ON_DEVICE
            local -> NoteMode.PREFER_ON_DEVICE
            env.killCloud -> return NoteOutcome.FillByHand
            !env.cloudConsent -> return NoteOutcome.NeedsConsent
            else -> NoteMode.PREFER_ON_DEVICE
        }
        // A route that can reach the cloud needs a signed-in user (cloud requests carry its ID
        // token). If sign-in fails, the note stays on this phone, or nothing is sent at all.
        val mode = if (wanted == NoteMode.ONLY_ON_DEVICE || signedIn()) wanted
        else if (local) NoteMode.ONLY_ON_DEVICE
        else return NoteOutcome.Failed
        val reply = try {
            model.structure(mode, prompt(cleaned))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            return NoteOutcome.Failed
        }
        // A device-only read never keeps a reply the SDK reports from the cloud: the family did not agree to it.
        if (mode == NoteMode.ONLY_ON_DEVICE && reply.source != Source.ON_DEVICE) return NoteOutcome.Failed
        val reading = parse(reply.text, cleaned) ?: return NoteOutcome.Invalid
        val path = if (reply.source == Source.ON_DEVICE) "on_device" else "cloud"
        val reason = when {
            reply.source == Source.ON_DEVICE -> "on_device_default"
            local -> "sdk_fallback"
            else -> "on_device_unavailable"
        }
        val route = RouteRecord(
            platform = "android", path = path, stage = "sdk",
            model = if (reply.source == Source.ON_DEVICE) ON_DEVICE_MODEL else env.modelName, reason = reason,
            latencyMs = reply.latencyMs, sdkReported = true, blocked = null, decidedAtMs = env.nowMs(),
        )
        return NoteOutcome.Read(reading, route, cleaned)
    }

    private suspend fun signedIn(): Boolean = try {
        signIn.ensureSignedIn()
        true
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        false
    }

    companion object {
        const val MAX_NOTE = 2000
        const val MAX_LABEL = 60
        const val MAX_SUMMARY = 200

        fun prompt(cleanedNote: String): String =
            "A family member typed a note about a relative who may wander. " +
                "Sort it into one kind: place (somewhere they like to go), address (a place they used to live), " +
                "wandering (where they were found before), or clothing (what they wear). " +
                "Give a short label of at most $MAX_LABEL characters, a one-sentence summary, " +
                "and evidenceQuote copied exactly from the note. Use only the note.\n\nNote: " + cleanedNote

        fun parse(text: String?, cleanedNote: String): FamilyNoteReading? {
            if (text == null) return null
            val o: JsonObject = runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            fun s(k: String) = runCatching { o[k]?.jsonPrimitive?.content }.getOrNull()?.trim()
            val kind = s("kind") ?: return null
            val label = s("label") ?: return null
            val summary = s("summary") ?: ""
            val quote = s("evidenceQuote") ?: return null
            if (kind !in FamilyNoteReading.KINDS) return null
            if (label.isEmpty() || label.length > MAX_LABEL) return null
            if (quote.isEmpty() || !cleanedNote.contains(quote)) return null
            return FamilyNoteReading(kind, label, summary.take(MAX_SUMMARY), quote)
        }
    }
}
