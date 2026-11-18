package app.pointlastseen.family.config

/** Remote Config values this app reads (spec section 14). None changes engine output. */
data class RcValues(
    val cloudModelAndroid: String,
    val clipModel: String,
    val killCloud: Boolean,
    val useLimitedUseTokens: Boolean,
    val minimumVersionAndroid: Long,
) {
    fun needsUpdate(versionCode: Long): Boolean = versionCode < minimumVersionAndroid

    companion object {
        const val DEFAULT_MODEL = "gemini-3.5-flash-lite"

        val DEFAULTS = RcValues(
            cloudModelAndroid = DEFAULT_MODEL,
            clipModel = DEFAULT_MODEL,
            killCloud = false,
            useLimitedUseTokens = true,
            minimumVersionAndroid = 0L,
        )

        /** In-app defaults handed to Remote Config's setDefaultsAsync. */
        val DEFAULT_MAP: Map<String, Any> = mapOf(
            "cloud_model_android" to DEFAULT_MODEL,
            "clip_model" to DEFAULT_MODEL,
            "kill_cloud" to false,
            "use_limited_use_tokens" to true,
            "minimum_version_android" to 0L,
        )

        private fun bool(s: String?, d: Boolean) = when (s?.trim()?.lowercase()) {
            "true" -> true
            "false" -> false
            else -> d
        }

        fun from(m: Map<String, String>): RcValues = RcValues(
            cloudModelAndroid = m["cloud_model_android"]?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULTS.cloudModelAndroid,
            clipModel = m["clip_model"]?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULTS.clipModel,
            killCloud = bool(m["kill_cloud"], DEFAULTS.killCloud),
            useLimitedUseTokens = bool(m["use_limited_use_tokens"], DEFAULTS.useLimitedUseTokens),
            minimumVersionAndroid = m["minimum_version_android"]?.trim()?.toLongOrNull() ?: DEFAULTS.minimumVersionAndroid,
        )
    }
}
