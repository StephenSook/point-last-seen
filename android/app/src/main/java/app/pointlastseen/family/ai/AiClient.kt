package app.pointlastseen.family.ai

import app.pointlastseen.family.config.RcValues
import com.google.firebase.Firebase
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import java.util.Base64

/** SDK values mapped to the app's own, so the logic above stays free of SDK types. */
@OptIn(PublicPreviewAPI::class)
object AiMapping {
    fun source(s: InferenceSource): Source = if (s == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD

    fun status(s: OnDeviceModelStatus?): DeviceModelStatus = when (s) {
        OnDeviceModelStatus.AVAILABLE -> DeviceModelStatus.AVAILABLE
        OnDeviceModelStatus.DOWNLOADABLE -> DeviceModelStatus.DOWNLOADABLE
        OnDeviceModelStatus.DOWNLOADING -> DeviceModelStatus.DOWNLOADING
        OnDeviceModelStatus.UNAVAILABLE -> DeviceModelStatus.UNAVAILABLE
        else -> DeviceModelStatus.UNKNOWN
    }

    /** With kill_cloud on, the hybrid mode is pinned to this phone whatever the caller asked. */
    fun mode(m: NoteMode, killCloud: Boolean): InferenceMode = when {
        killCloud || m == NoteMode.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
        else -> InferenceMode.PREFER_ON_DEVICE
    }
}

/** Thrown at the cloud-call boundary while Remote Config's kill_cloud is on. */
class CloudPausedException : IllegalStateException("kill_cloud is on")

/**
 * Every model call in the family app goes through Firebase AI Logic here, on the
 * Gemini Developer API backend, with App Check (limited-use tokens behind Remote Config).
 */
@OptIn(PublicPreviewAPI::class)
class AiClient(private val rc: () -> RcValues) {

    private fun ai(): FirebaseAI = Firebase.ai(
        backend = GenerativeBackend.googleAI(),
        useLimitedUseAppCheckTokens = rc().useLimitedUseTokens,
    )

    /** Hybrid, so no manual schema: the note's structure comes from the @Generable NoteReply. */
    private fun noteModel(mode: InferenceMode) = ai().generativeModel(
        modelName = rc().cloudModelAndroid,
        onDeviceConfig = OnDeviceConfig(mode = mode),
    )

    /** FamilyNote's model: the SDK's hybrid mode, with the source it reports. */
    val familyNote: NoteModel = NoteModel { mode, prompt ->
        val t0 = System.nanoTime()
        val r = noteModel(AiMapping.mode(mode, rc().killCloud)).generateObject(NoteReply.firebaseAISchema(), prompt)
        ModelReply(noteReplyText(r), AiMapping.source(r.response.inferenceSource), (System.nanoTime() - t0) / 1_000_000)
    }

    /** checkStatus() for "About this phone". */
    suspend fun deviceModelStatus(): DeviceModelStatus = runCatching {
        AiMapping.status(noteModel(InferenceMode.PREFER_ON_DEVICE).onDeviceExtension?.checkStatus())
    }.getOrDefault(DeviceModelStatus.UNKNOWN)

    /**
     * The clip read: the server prompt template (Remote Config clip_template_id) holds the model,
     * the prompt and the camera-sighting schema; the app sends only the clip's type and its bytes as
     * base64. Cloud only. The reply is checked exactly as before.
     */
    suspend fun readClip(bytes: ByteArray, mimeType: String): ModelReply {
        if (rc().killCloud) throw CloudPausedException()
        val inputs = mapOf(CLIP_MIME_TYPE_INPUT to mimeType, CLIP_VIDEO_INPUT to Base64.getEncoder().encodeToString(bytes))
        val t0 = System.nanoTime()
        val r = ai().templateGenerativeModel().generateContent(rc().clipTemplateId, inputs)
        return ModelReply(r.text, AiMapping.source(r.inferenceSource), (System.nanoTime() - t0) / 1_000_000)
    }

    companion object {
        /** The template's input names (shared/templates/pls-clip-read-v1.json). */
        const val CLIP_MIME_TYPE_INPUT = "mimeType"
        const val CLIP_VIDEO_INPUT = "videoData"
    }
}
