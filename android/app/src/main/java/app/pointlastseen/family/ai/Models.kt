package app.pointlastseen.family.ai

/** Where the SDK says a reply was made. */
enum class Source { ON_DEVICE, IN_CLOUD }

/** The on-device model state reported by the SDK's checkStatus(). */
enum class DeviceModelStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE, UNKNOWN }

/** One model reply: its text, the SDK-reported source, and how long it took. */
data class ModelReply(val text: String?, val source: Source, val latencyMs: Long)
