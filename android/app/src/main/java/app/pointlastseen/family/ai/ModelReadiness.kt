package app.pointlastseen.family.ai

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/** The on-device model as the screens show it. */
data class ModelState(
    val status: DeviceModelStatus = DeviceModelStatus.UNKNOWN,
    /** While this app's download runs: bytes so far, and the total (0 when the SDK has not said). */
    val downloadedBytes: Long = 0,
    val totalBytes: Long = 0,
    /** This app's last download failed; notes still go to the cloud after consent, or are sorted by hand. */
    val downloadFailed: Boolean = false,
) {
    /** Whole percent downloaded, or null when the total is not known. */
    val percent: Int? get() = if (totalBytes <= 0) null else (downloadedBytes * 100 / totalBytes).coerceIn(0, 100).toInt()
}

/**
 * Checks the on-device model and gets it: at launch and whenever the app comes back to the front
 * ([refresh]), and when the family asks ([getModel]). The SDK never downloads the model by itself
 * (a note on a phone without it is read in the cloud, or not at all), so the app starts the download
 * early: at launch on Wi-Fi (an unmetered network); on mobile data the family is asked first. A phone
 * with no model never downloads. Every state change goes to [publish]. Runs on [scope]'s thread.
 */
class ModelReadiness(
    private val scope: CoroutineScope,
    private val check: suspend () -> DeviceModelStatus,
    private val download: () -> Flow<ModelDownload>,
    private val unmetered: () -> Boolean,
    private val publish: (ModelState) -> Unit,
) {
    private var state = ModelState()
    private var latestCheck = 0L
    private var launchChecked = false
    private var downloadActive = false

    fun refresh() {
        // Only the most recently started check may update the screen: an older one finishing last
        // (a resume check during a download, say) would otherwise put back a stale status.
        val mine = ++latestCheck
        scope.launch {
            val status = try {
                check()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                DeviceModelStatus.UNKNOWN
            }
            if (mine == latestCheck) set(state.copy(status = shown(status)))
            if (!launchChecked) {
                launchChecked = true
                if (status == DeviceModelStatus.DOWNLOADABLE && unmetered()) getModel()
            }
        }
    }

    fun getModel() {
        if (downloadActive) return
        downloadActive = true
        set(ModelState(DeviceModelStatus.DOWNLOADING))
        scope.launch {
            var failed = false
            try {
                download().collect { step ->
                    when (step) {
                        is ModelDownload.Started -> set(state.copy(totalBytes = step.bytesToDownload))
                        is ModelDownload.Progress -> set(state.copy(downloadedBytes = step.bytesDownloaded))
                        is ModelDownload.Failed -> failed = true
                        ModelDownload.Done -> Unit
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The pinned SDK reports a failed download as a Failed step and then ends the flow with
                // the exception: either way the family sees a message, and the app never crashes.
                failed = true
            } finally {
                downloadActive = false
            }
            state = ModelState(state.status, downloadFailed = failed)
            refresh()
        }
    }

    /** While this app's download runs, a status below AVAILABLE still shows DOWNLOADING, so the offer cannot come back. */
    private fun shown(status: DeviceModelStatus): DeviceModelStatus =
        if (downloadActive && status != DeviceModelStatus.AVAILABLE) DeviceModelStatus.DOWNLOADING else status

    private fun set(s: ModelState) {
        state = s
        publish(s)
    }
}
