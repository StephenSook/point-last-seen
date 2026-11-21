package app.pointlastseen.family.ai

import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.PublicPreviewAPI
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(PublicPreviewAPI::class)
class AiMappingTest {
    @Test fun sdkSourcesMapToOurs() {
        assertEquals(Source.ON_DEVICE, AiMapping.source(InferenceSource.ON_DEVICE))
        assertEquals(Source.IN_CLOUD, AiMapping.source(InferenceSource.IN_CLOUD))
    }

    @Test fun sdkStatusesMapToOurs() {
        assertEquals(DeviceModelStatus.AVAILABLE, AiMapping.status(OnDeviceModelStatus.AVAILABLE))
        assertEquals(DeviceModelStatus.DOWNLOADABLE, AiMapping.status(OnDeviceModelStatus.DOWNLOADABLE))
        assertEquals(DeviceModelStatus.DOWNLOADING, AiMapping.status(OnDeviceModelStatus.DOWNLOADING))
        assertEquals(DeviceModelStatus.UNAVAILABLE, AiMapping.status(OnDeviceModelStatus.UNAVAILABLE))
        assertEquals(DeviceModelStatus.UNKNOWN, AiMapping.status(null))
    }

    @Test fun sdkDownloadStepsMapToOurs() {
        // The SDK's constructors are Kotlin-internal, so the test builds them by reflection.
        fun <T> make(c: Class<T>, n: Long): T = c.getDeclaredConstructor(Long::class.javaPrimitiveType).apply { isAccessible = true }.newInstance(n)
        assertEquals(ModelDownload.Started(100L), AiMapping.download(make(DownloadStatus.DownloadStarted::class.java, 100L)))
        assertEquals(ModelDownload.Progress(40L), AiMapping.download(make(DownloadStatus.DownloadInProgress::class.java, 40L)))
        assertEquals(ModelDownload.Done, AiMapping.download(DownloadStatus.DownloadCompleted))
    }

    @Test fun noteModesMapToSdkModes() {
        assertEquals(InferenceMode.ONLY_ON_DEVICE, AiMapping.mode(NoteMode.ONLY_ON_DEVICE, killCloud = false))
        assertEquals(InferenceMode.PREFER_ON_DEVICE, AiMapping.mode(NoteMode.PREFER_ON_DEVICE, killCloud = false))
    }

    @Test fun killCloudKeepsTheHybridModeOnTheDevice() {
        assertEquals(InferenceMode.ONLY_ON_DEVICE, AiMapping.mode(NoteMode.PREFER_ON_DEVICE, killCloud = true))
        assertEquals(InferenceMode.PREFER_ON_DEVICE, AiMapping.mode(NoteMode.PREFER_ON_DEVICE, killCloud = false))
        assertEquals(InferenceMode.ONLY_ON_DEVICE, AiMapping.mode(NoteMode.ONLY_ON_DEVICE, killCloud = false))
    }

    @Test fun theClipCallRefusesWhileTheCloudIsPaused() {
        val client = AiClient { app.pointlastseen.family.config.RcValues.DEFAULTS.copy(killCloud = true) }
        val e = runCatching { kotlinx.coroutines.runBlocking { client.readClip(byteArrayOf(1), "video/mp4") } }.exceptionOrNull()
        assertEquals(CloudPausedException::class, e?.let { it::class })
    }
}
