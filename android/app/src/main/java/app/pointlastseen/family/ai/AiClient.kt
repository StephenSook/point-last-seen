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
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig

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

    fun mode(m: NoteMode): InferenceMode = when (m) {
        NoteMode.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
        NoteMode.PREFER_ON_DEVICE -> InferenceMode.PREFER_ON_DEVICE
    }
}

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

    private fun noteModel(mode: InferenceMode) = ai().generativeModel(
        modelName = rc().cloudModelAndroid,
        generationConfig = generationConfig {
            responseMimeType = "application/json"
            responseSchema = AiSchemas.note
        },
        onDeviceConfig = OnDeviceConfig(mode = mode),
    )

    /** FamilyNote's model: the SDK's hybrid mode, with the source it reports. */
    val familyNote: NoteModel = NoteModel { mode, prompt ->
        val t0 = System.nanoTime()
        val r = noteModel(AiMapping.mode(mode)).generateContent(prompt)
        ModelReply(r.text, AiMapping.source(r.inferenceSource), (System.nanoTime() - t0) / 1_000_000)
    }

    /** checkStatus() for "About this phone". */
    suspend fun deviceModelStatus(): DeviceModelStatus = runCatching {
        AiMapping.status(noteModel(InferenceMode.PREFER_ON_DEVICE).onDeviceExtension?.checkStatus())
    }.getOrDefault(DeviceModelStatus.UNKNOWN)

    /** The clip read: cloud only, inline video, closed schema. */
    suspend fun readClip(bytes: ByteArray, mimeType: String): ModelReply {
        val model = ai().generativeModel(
            modelName = rc().clipModel,
            generationConfig = generationConfig {
                responseMimeType = "application/json"
                responseSchema = AiSchemas.clip
            },
            onDeviceConfig = OnDeviceConfig.IN_CLOUD,
        )
        val t0 = System.nanoTime()
        val r = model.generateContent(
            content {
                inlineData(bytes, mimeType)
                text(AiSchemas.CLIP_PROMPT)
            },
        )
        return ModelReply(r.text, AiMapping.source(r.inferenceSource), (System.nanoTime() - t0) / 1_000_000)
    }
}
