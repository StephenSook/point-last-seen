package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus

/** Fixed app copy, in one place so tests pin it. */
object Copy {
    const val DRILL = "Training drill. Nobody is missing."

    private fun isDrill(mode: String?) = mode == "drill" || mode == "judge"

    fun drillBanner(mode: String?): String? = if (isDrill(mode)) DRILL else null

    fun callFirst(mode: String?): String =
        if (isDrill(mode)) "Training drill. Call the drill call-taker, not 911." else "Call 911 first."

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
