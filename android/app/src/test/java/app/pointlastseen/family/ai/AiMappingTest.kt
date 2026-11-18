package app.pointlastseen.family.ai

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

    @Test fun noteModesMapToSdkModes() {
        assertEquals(InferenceMode.ONLY_ON_DEVICE, AiMapping.mode(NoteMode.ONLY_ON_DEVICE))
        assertEquals(InferenceMode.PREFER_ON_DEVICE, AiMapping.mode(NoteMode.PREFER_ON_DEVICE))
    }

    @Test fun theClipSchemaNamesEveryCameraSightingField() {
        assertEquals(
            setOf(
                "personVisible", "firstSeen", "lastSeen", "entryEdge", "exitEdge", "topColor", "bottomColor",
                "topType", "footwear", "headwear", "carriedItems", "keyFrame", "lighting", "legibility", "evidence",
            ),
            AiSchemas.clip.properties!!.keys,
        )
    }

    @Test fun theNoteSchemaNamesEveryReadingField() {
        assertEquals(setOf("kind", "label", "summary", "evidenceQuote"), AiSchemas.note.properties!!.keys)
    }

    @Test fun theClipPromptAsksForNoFacesOrNames() {
        val p = AiSchemas.CLIP_PROMPT.lowercase()
        assertEquals(true, p.contains("do not describe the face"))
        assertEquals(true, p.contains("do not guess who"))
    }
}
