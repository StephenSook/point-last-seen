package app.pointlastseen.family.ui

import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.data.RouteRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CopyTest {
    @Test fun statusSentences() {
        assertEquals("Searchers are looking.", Copy.status("open"))
        assertEquals("The search is closed.", Copy.status("closed"))
        assertEquals("The search is closed.", Copy.status("closed", "suspended"))
        assertEquals("The search is closed.", Copy.status("closed", "training_ended"))
    }

    /** A search that ended with the person found says only that the lead will call: news comes by phone, never from the app. */
    @Test fun aFoundSearchSaysTheLeadWillCall() {
        assertEquals("The search has ended. Your search lead will call you.", Copy.status("closed", "found"))
        assertEquals("The search has ended. Your search lead will call you.", Copy.status("found"))
        for (s in listOf(Copy.status("found"), Copy.status("closed", "found"))) {
            assertTrue(s, !s.contains("found", ignoreCase = true) && !s.contains("safe", ignoreCase = true))
        }
    }

    @Test fun aSendAfterTheSearchEndedSaysSo() {
        assertEquals("The search has ended, so this was not sent.", Copy.SEARCH_ENDED_NOT_SENT)
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

    @Test fun theModelSentenceForEachState() {
        assertEquals("This phone has no on-device model.", Copy.model(ModelState(DeviceModelStatus.UNAVAILABLE)))
        assertEquals("Ready on this phone.", Copy.model(ModelState(DeviceModelStatus.AVAILABLE)))
        assertEquals("An on-device model can be downloaded to this phone.", Copy.model(ModelState(DeviceModelStatus.DOWNLOADABLE)))
        assertEquals("The on-device model is downloading.", Copy.model(ModelState(DeviceModelStatus.DOWNLOADING)))
        assertEquals("The on-device model is downloading: 40%.", Copy.model(ModelState(DeviceModelStatus.DOWNLOADING, 40, 100)))
        assertEquals("This phone could not report its on-device model.", Copy.model(ModelState(DeviceModelStatus.UNKNOWN)))
    }

    @Test fun aReadSaysWhereItRanHowLongItTookAndWhyItWentToTheCloud() {
        fun route(path: String, reason: String, ms: Long) = RouteRecord("android", path, "sdk", "m", reason, ms, true, null, 1)
        assertEquals("Read on this phone in 1.2 s.", Copy.readWhere(route("on_device", "on_device_default", 1234), DeviceModelStatus.AVAILABLE))
        assertEquals("Read in the cloud in 3.5 s. The on-device model could not read it.", Copy.readWhere(route("cloud", "sdk_fallback", 3497), DeviceModelStatus.AVAILABLE))
        assertEquals("Read in the cloud in 0.9 s. This phone has no on-device model.", Copy.readWhere(route("cloud", "on_device_unavailable", 900), DeviceModelStatus.UNAVAILABLE))
        assertEquals("Read in the cloud in 2.0 s. The on-device model is not downloaded yet.", Copy.readWhere(route("cloud", "on_device_unavailable", 2000), DeviceModelStatus.DOWNLOADABLE))
        assertEquals("Read in the cloud in 2.0 s. The on-device model is still downloading.", Copy.readWhere(route("cloud", "on_device_unavailable", 2000), DeviceModelStatus.DOWNLOADING))
        assertEquals("Read in the cloud in 2.0 s. This phone could not report its on-device model.", Copy.readWhere(route("cloud", "on_device_unavailable", 2000), DeviceModelStatus.UNKNOWN))
        assertEquals("Read in the cloud in 12.3 s.", Copy.readWhere(route("cloud", "other", 12345), DeviceModelStatus.UNKNOWN))
    }

    @Test fun theDownloadOfferAndItsFailure() {
        assertEquals("Get the on-device model", Copy.GET_MODEL)
        assertEquals("The on-device model could not be downloaded. Try again on Wi-Fi.", Copy.MODEL_FAILED)
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
