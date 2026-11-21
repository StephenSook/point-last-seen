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
    // A refresh asked for the launch decision; whichever check is latest when it ends makes it.
    private var launchWanted = false
    // The newest check that has finished, and its answer: a check that ends after a newer one routes on that.
    private var finishedCheck = 0L
    private var finishedStatus = DeviceModelStatus.UNKNOWN
    private var downloadActive = false

    fun refresh() {
        launchWanted = true
        val mine = ++latestCheck
        scope.launch { checkAs(mine) }
    }

    /**
     * A fresh check, for a note about to be routed: the shown status can be stale (another app's download of
     * the shared model ends with no word to this app, or the model was removed). Returns the status to route on.
     */
    suspend fun current(): DeviceModelStatus = checkAs(++latestCheck)

    private suspend fun checkAs(mine: Long): DeviceModelStatus {
        val status = try {
            check()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            DeviceModelStatus.UNKNOWN
        }
        if (mine > finishedCheck) {
            finishedCheck = mine
            finishedStatus = status
        }
        // Only the most recently started check may update the screen or decide the launch download: an
        // older one finishing out of order (a resume check during a download, say) would put back a stale
        // status, or use up the one automatic download on a stale answer. It routes on the newest answer.
        if (mine != latestCheck) return shown(finishedStatus)
        set(state.copy(status = shown(status)))
        if (launchWanted && !launchChecked) {
            launchChecked = true
            if (status == DeviceModelStatus.DOWNLOADABLE && unmetered()) getModel()
        }
        return shown(status)
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
