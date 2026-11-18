package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CopyTest {
    @Test fun statusSentences() {
        assertEquals("Searchers are looking.", Copy.status("open"))
        assertEquals("Found. Safe.", Copy.status("found"))
        assertEquals("The search is closed.", Copy.status("closed"))
    }

    @Test fun callFirstSaysTheDrillCallTakerInADrill() {
        assertEquals("Training drill. Call the drill call-taker, not 911.", Copy.callFirst("drill"))
        assertEquals("Training drill. Call the drill call-taker, not 911.", Copy.callFirst("judge"))
        assertEquals("Call 911 first.", Copy.callFirst(null))
    }

    @Test fun theUnjoinedCallFirstScreenNamesTheDrillCallTaker() {
        assertEquals("In a training drill, call the drill call-taker, not 911.", Copy.UNJOINED_DRILL_HINT)
    }

    @Test fun drillBannerOnEveryDrillScreen() {
        assertEquals("Training drill. Nobody is missing.", Copy.drillBanner("drill"))
        assertEquals("Training drill. Nobody is missing.", Copy.drillBanner("judge"))
        assertNull(Copy.drillBanner(null))
    }

    @Test fun killCloudBannerSaysWhatStillWorks() {
        assertEquals("Cloud reading is paused. You can still type everything in.", Copy.KILL_CLOUD)
    }

    @Test fun aboutThisPhone() {
        assertEquals("This phone has no on-device model.", Copy.aboutModel(DeviceModelStatus.UNAVAILABLE))
        assertEquals("This phone has an on-device model.", Copy.aboutModel(DeviceModelStatus.AVAILABLE))
        assertEquals("An on-device model can be downloaded to this phone.", Copy.aboutModel(DeviceModelStatus.DOWNLOADABLE))
        assertEquals("An on-device model is downloading to this phone.", Copy.aboutModel(DeviceModelStatus.DOWNLOADING))
        assertEquals("This phone could not report its on-device model.", Copy.aboutModel(DeviceModelStatus.UNKNOWN))
    }
}
