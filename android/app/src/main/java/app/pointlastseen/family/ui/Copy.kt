package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.data.RouteRecord
import java.util.Locale

/** Fixed app copy, in one place so tests pin it. */
object Copy {
    const val DRILL = "Training drill. Nobody is missing."
    const val KILL_CLOUD = "Cloud reading is paused. You can still type everything in."
    const val EVIDENCE = "This may be evidence. Do not touch it. Call command now."
    const val UNJOINED_DRILL_HINT = "In a training drill, call the drill call-taker, not 911."
    const val NO_LONGER_MEMBER = "You are no longer part of this search. Ask the search lead for a new code."
    const val NOT_ENGLISH = "This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand."
    const val LEAVE_CONFIRM = "Leave this search? You will need a new code from the search lead to join again."
    /**
     * The clip's cloud consent: one press stores the clip with the search (Storage clips/, deleted by the bucket
     * lifecycle rule after 30 days, or sooner by command) and sends it to Gemini to read.
     */
    const val CLIP_CLOUD = "Send it to the cloud: stored with this search for up to 30 days and read by Gemini"
    /** Advice for the first minutes from a dementia-care expert, quoted as her advice. */
    const val FIRST_MINUTES = "Look in the immediate area now. If you don't find them within 5 minutes, call 911."
    const val FIRST_MINUTES_SOURCE = "Guidance from Kim Franklin, Alzheimer's Association Georgia"
    /** Where the release APK is published (GitHub Releases). */
    const val DOWNLOAD_PAGE = "https://github.com/StephenSook/point-last-seen/releases/latest"

    /** The line under a note while it is read. */
    fun reading(where: NoteUi.Where) = when (where) {
        NoteUi.Where.PHONE -> "Reading on this phone."
        NoteUi.Where.CLOUD -> "Reading in the cloud."
        NoteUi.Where.EITHER -> "Reading the note."
    }

    /** A drill or judge search: made-up data, our own film and call-taker. */
    fun isDrill(mode: String?) = mode == "drill" || mode == "judge"

    fun drillBanner(mode: String?): String? = if (isDrill(mode)) DRILL else null

    fun callFirst(mode: String?): String =
        if (isDrill(mode)) "Training drill. Call the drill call-taker, not 911." else FIRST_MINUTES

    /** The fixed status line: news about the missing person never comes from this app. */
    fun newsByPhone(name: String): String =
        "News about ${name.trim().ifEmpty { "them" }} comes from your search lead by phone, never from this app."

    /**
     * The status sentence. A search that ended with the person found ([closedReason] "found", or the older bare
     * "found" status) says only that the lead will call: the news itself comes by phone, never from this app.
     */
    fun status(status: String?, closedReason: String? = null): String = when {
        status == "found" || (status == "closed" && closedReason == "found") -> SEARCH_ENDED_LEAD_CALLS
        status == "closed" -> "The search is closed."
        else -> "Searchers are looking."
    }

    const val SEARCH_ENDED_LEAD_CALLS = "The search has ended. Your search lead will call you."

    /** A send started after the search ended: the server takes no new data for it. */
    const val SEARCH_ENDED_NOT_SENT = "The search has ended, so this was not sent."

    /** The on-device model in one sentence: ready, offered, downloading (with its percent when known), or absent. */
    fun model(m: ModelState): String = when (m.status) {
        DeviceModelStatus.AVAILABLE -> "Ready on this phone."
        DeviceModelStatus.DOWNLOADABLE -> "An on-device model can be downloaded to this phone."
        DeviceModelStatus.DOWNLOADING -> m.percent?.let { "The on-device model is downloading: $it%." } ?: "The on-device model is downloading."
        DeviceModelStatus.UNAVAILABLE -> "This phone has no on-device model."
        DeviceModelStatus.UNKNOWN -> "This phone could not report its on-device model."
    }

    /** Where a read ran and how long it took; for a cloud read, why it did not run on this phone. */
    fun readWhere(route: RouteRecord, status: DeviceModelStatus): String {
        val took = String.format(Locale.US, "%.1f s", route.latencyMs / 1000.0)
        if (route.path == "on_device") return "Read on this phone in $took."
        val why = when {
            route.reason == "sdk_fallback" -> "The on-device model could not read it."
            route.reason != "on_device_unavailable" -> null
            status == DeviceModelStatus.UNAVAILABLE -> "This phone has no on-device model."
            status == DeviceModelStatus.DOWNLOADABLE -> "The on-device model is not downloaded yet."
            status == DeviceModelStatus.DOWNLOADING -> "The on-device model is still downloading."
            else -> "This phone could not report its on-device model."
        }
        return "Read in the cloud in $took." + (why?.let { " $it" } ?: "")
    }

    const val GET_MODEL = "Get the on-device model"
    const val MODEL_FAILED = "The on-device model could not be downloaded. Try again on Wi-Fi."

    /** The App Check provider this build uses. It names the provider; it does not say a check passed. */
    fun appCheckProvider(provider: String): String =
        "App Check provider: " + if (provider == "play_integrity") "Play Integrity" else provider
}
