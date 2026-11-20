package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus

/** Fixed app copy, in one place so tests pin it. */
object Copy {
    const val DRILL = "Training drill. Nobody is missing."
    const val KILL_CLOUD = "Cloud reading is paused. You can still type everything in."
    const val EVIDENCE = "This may be evidence. Do not touch it. Call command now."
    const val UNJOINED_DRILL_HINT = "In a training drill, call the drill call-taker, not 911."
    const val NO_LONGER_MEMBER = "You are no longer part of this search. Ask the search lead for a new code."
    /** Advice for the first minutes from a dementia-care expert, quoted as her advice. */
    const val FIRST_MINUTES = "Look in the immediate area now. If you don't find them within 5 minutes, call 911."
    const val FIRST_MINUTES_SOURCE = "Guidance from Kim Franklin, Alzheimer's Association Georgia"
    /** Where the release APK is published (GitHub Releases). */
    const val DOWNLOAD_PAGE = "https://github.com/StephenSook/point-last-seen/releases/latest"

    private fun isDrill(mode: String?) = mode == "drill" || mode == "judge"

    fun drillBanner(mode: String?): String? = if (isDrill(mode)) DRILL else null

    fun callFirst(mode: String?): String =
        if (isDrill(mode)) "Training drill. Call the drill call-taker, not 911." else FIRST_MINUTES

    /** The fixed status line: news about the missing person never comes from this app. */
    fun newsByPhone(name: String): String =
        "News about ${name.trim().ifEmpty { "them" }} comes from your search lead by phone, never from this app."

    fun status(status: String?): String = when (status) {
        "found" -> "Found. Safe."
        "closed" -> "The search is closed."
        else -> "Searchers are looking."
    }

    fun aboutModel(s: DeviceModelStatus): String = when (s) {
        DeviceModelStatus.AVAILABLE -> "This phone has an on-device model."
        DeviceModelStatus.DOWNLOADABLE -> "An on-device model can be downloaded to this phone."
        DeviceModelStatus.DOWNLOADING -> "An on-device model is downloading to this phone."
        DeviceModelStatus.UNAVAILABLE -> "This phone has no on-device model."
        DeviceModelStatus.UNKNOWN -> "This phone could not report its on-device model."
    }
}
