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
        assertEquals("Look in the immediate area now. If you don't find them within 5 minutes, call 911.", Copy.callFirst(null))
    }

    /** The first minutes, in her words of advice: look nearby now, call 911 within five minutes. */
    @Test fun theFirstMinutesGuidanceAndItsSource() {
        assertEquals("Look in the immediate area now. If you don't find them within 5 minutes, call 911.", Copy.FIRST_MINUTES)
        assertEquals("Guidance from Kim Franklin, Alzheimer's Association Georgia", Copy.FIRST_MINUTES_SOURCE)
    }

    @Test fun theUnjoinedCallFirstScreenNamesTheDrillCallTaker() {
        assertEquals("In a training drill, call the drill call-taker, not 911.", Copy.UNJOINED_DRILL_HINT)
    }

    @Test fun theDownloadPageIsTheReleasesPage() {
        assertEquals("https://github.com/StephenSook/point-last-seen/releases/latest", Copy.DOWNLOAD_PAGE)
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

    /** News about the missing person comes only by phone from the search lead, never from the app. */
    @Test fun theNewsLineSaysNewsComesByPhone() {
        org.junit.Assert.assertEquals("News about Mae comes from your search lead by phone, never from this app.", Copy.newsByPhone("Mae"))
        org.junit.Assert.assertEquals("News about them comes from your search lead by phone, never from this app.", Copy.newsByPhone("  "))
    }

    @Test fun aDroppedSearchSaysWhyAndWhatToDo() {
        assertEquals("You are no longer part of this search. Ask the search lead for a new code.", Copy.NO_LONGER_MEMBER)
    }

    @Test fun leavingAnOpenSearchAsksInPlainWords() {
        assertEquals("Leave this search? You will need a new code from the search lead to join again.", Copy.LEAVE_CONFIRM)
    }
}
