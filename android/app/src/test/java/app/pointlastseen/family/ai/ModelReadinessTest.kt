package app.pointlastseen.family.ai

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class ModelReadinessTest {

    /** A fake phone: its status answers come from [statuses] in turn (the last one repeats). */
    private class Phone(vararg statuses: DeviceModelStatus) {
        val answers = ArrayDeque(statuses.toList())
        var downloads = 0
        var unmetered = true
        var downloadFlow: () -> Flow<ModelDownload> = { flowOf(ModelDownload.Done) }
        val seen = mutableListOf<ModelState>()

        suspend fun check(): DeviceModelStatus = if (answers.size > 1) answers.removeFirst() else answers.first()

        fun download(): Flow<ModelDownload> {
            downloads++
            return downloadFlow()
        }

        fun readiness(scope: TestScope) = ModelReadiness(scope, ::check, ::download, { unmetered }) { seen += it }
    }

    @Test fun onWifiTheLaunchCheckDownloadsADownloadableModelAndShowsItsProgress() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE, DeviceModelStatus.AVAILABLE)
        phone.downloadFlow = { flowOf(ModelDownload.Started(100), ModelDownload.Progress(40), ModelDownload.Done) }
        phone.readiness(this).refresh()
        advanceUntilIdle()
        assertEquals(1, phone.downloads)
        assertTrue(phone.seen.any { it.status == DeviceModelStatus.DOWNLOADING && it.downloadedBytes == 40L && it.totalBytes == 100L })
        assertEquals(ModelState(DeviceModelStatus.AVAILABLE), phone.seen.last())
    }

    @Test fun onMobileDataTheLaunchCheckOnlyOffersTheDownload() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        phone.readiness(this).refresh()
        advanceUntilIdle()
        assertEquals(0, phone.downloads)
        assertEquals(DeviceModelStatus.DOWNLOADABLE, phone.seen.last().status)
    }

    @Test fun aPhoneWithNoModelNeverDownloads() = runTest {
        val phone = Phone(DeviceModelStatus.UNAVAILABLE)
        val readiness = phone.readiness(this)
        readiness.refresh()
        advanceUntilIdle()
        assertEquals(0, phone.downloads)
        assertEquals(DeviceModelStatus.UNAVAILABLE, phone.seen.last().status)
    }

    @Test fun onlyTheLaunchCheckStartsADownloadByItself() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        val readiness = phone.readiness(this)
        readiness.refresh()
        advanceUntilIdle()
        phone.unmetered = true
        readiness.refresh()
        advanceUntilIdle()
        assertEquals(0, phone.downloads)
    }

    @Test fun askingForTheModelTwiceStartsOneDownload() = runTest {
        // No launch check here: the only status check is the one after the download ends.
        val phone = Phone(DeviceModelStatus.AVAILABLE).apply { unmetered = false }
        val gate = CompletableDeferred<Unit>()
        phone.downloadFlow = { flow { emit(ModelDownload.Started(10)); gate.await(); emit(ModelDownload.Done) } }
        val readiness = phone.readiness(this)
        readiness.getModel()
        readiness.getModel()
        advanceUntilIdle()
        assertEquals(1, phone.downloads)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(DeviceModelStatus.AVAILABLE, phone.seen.last().status)
    }

    @Test fun aFailedStepShowsTheFailureAndChecksTheModelAgain() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        phone.downloadFlow = { flowOf(ModelDownload.Started(10), ModelDownload.Failed("no space")) }
        phone.readiness(this).getModel()
        advanceUntilIdle()
        assertEquals(ModelState(DeviceModelStatus.DOWNLOADABLE, downloadFailed = true), phone.seen.last())
    }

    @Test fun aDownloadThatThrowsIsAFailureNotACrash() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        phone.downloadFlow = { flow { emit(ModelDownload.Started(10)); throw IOException("network lost") } }
        phone.readiness(this).getModel()
        advanceUntilIdle()
        assertTrue(phone.seen.last().downloadFailed)
        assertEquals(DeviceModelStatus.DOWNLOADABLE, phone.seen.last().status)
    }

    @Test fun aNewDownloadClearsTheLastFailure() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        phone.downloadFlow = { flowOf(ModelDownload.Failed("first")) }
        val readiness = phone.readiness(this)
        readiness.getModel()
        advanceUntilIdle()
        val gate = CompletableDeferred<Unit>()
        phone.downloadFlow = { flow { emit(ModelDownload.Started(10)); gate.await() } }
        readiness.getModel()
        advanceUntilIdle()
        assertFalse(phone.seen.last().downloadFailed)
        assertEquals(DeviceModelStatus.DOWNLOADING, phone.seen.last().status)
        gate.complete(Unit)
        advanceUntilIdle()
    }

    @Test fun aStatusCheckDuringTheDownloadStillShowsDownloading() = runTest {
        val phone = Phone(DeviceModelStatus.DOWNLOADABLE).apply { unmetered = false }
        val gate = CompletableDeferred<Unit>()
        phone.downloadFlow = { flow { emit(ModelDownload.Started(10)); gate.await(); emit(ModelDownload.Done) } }
        val readiness = phone.readiness(this)
        readiness.getModel()
        advanceUntilIdle()
        // The app comes back to the front part way through; the SDK still says DOWNLOADABLE.
        readiness.refresh()
        advanceUntilIdle()
        assertEquals(DeviceModelStatus.DOWNLOADING, phone.seen.last().status)
        assertEquals(1, phone.downloads)
        gate.complete(Unit)
        advanceUntilIdle()
    }

    @Test fun anOlderCheckFinishingLastDoesNotPutBackItsAnswer() = runTest {
        val slow = CompletableDeferred<DeviceModelStatus>()
        var calls = 0
        val seen = mutableListOf<ModelState>()
        val readiness = ModelReadiness(
            this,
            check = { if (++calls == 1) slow.await() else DeviceModelStatus.AVAILABLE },
            download = { flowOf(ModelDownload.Done) },
            unmetered = { false },
        ) { seen += it }
        readiness.refresh()
        readiness.refresh()
        advanceUntilIdle()
        slow.complete(DeviceModelStatus.DOWNLOADABLE)
        advanceUntilIdle()
        assertEquals(DeviceModelStatus.AVAILABLE, seen.last().status)
    }

    @Test fun aCheckThatThrowsReadsAsUnknown() = runTest {
        val seen = mutableListOf<ModelState>()
        ModelReadiness(this, check = { throw IllegalStateException("AICore not bound") }, download = { flowOf() }, unmetered = { true }) { seen += it }
            .refresh()
        advanceUntilIdle()
        assertEquals(DeviceModelStatus.UNKNOWN, seen.last().status)
    }

    @Test fun thePercentIsKnownOnlyWithATotal() {
        assertNull(ModelState(DeviceModelStatus.DOWNLOADING, downloadedBytes = 40, totalBytes = 0).percent)
        assertEquals(40, ModelState(DeviceModelStatus.DOWNLOADING, downloadedBytes = 40, totalBytes = 100).percent)
        assertEquals(100, ModelState(DeviceModelStatus.DOWNLOADING, downloadedBytes = 150, totalBytes = 100).percent)
    }
}
