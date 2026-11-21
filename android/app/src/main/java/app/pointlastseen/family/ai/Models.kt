package app.pointlastseen.family.ai

/** Where the SDK says a reply was made. */
enum class Source { ON_DEVICE, IN_CLOUD }

/** On Android, Firebase AI Logic's on-device inference runs Gemini Nano through ML Kit's Prompt API. */
const val ON_DEVICE_MODEL = "gemini-nano (ML Kit Prompt API)"

/** The on-device model state reported by the SDK's checkStatus(). */
enum class DeviceModelStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE, UNKNOWN }

/** One step of this app's on-device model download, as the SDK reports it. */
sealed interface ModelDownload {
    data class Started(val bytesToDownload: Long) : ModelDownload
    data class Progress(val bytesDownloaded: Long) : ModelDownload
    data object Done : ModelDownload
    data class Failed(val message: String?) : ModelDownload
}

/** One model reply: its text, the SDK-reported source, and how long it took. */
data class ModelReply(val text: String?, val source: Source, val latencyMs: Long)
