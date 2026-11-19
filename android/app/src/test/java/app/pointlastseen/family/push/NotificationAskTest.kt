package app.pointlastseen.family.push

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationAskTest {
    /** Asked once, after joining a search, on Android 13 and later, and only while not granted. */
    @Test fun theAppAsksOnceAfterJoiningOnAndroid13AndLater() {
        assertTrue(NotificationAsk.shouldAsk(sdk = 33, granted = false, joined = true, askedBefore = false))
        assertFalse(NotificationAsk.shouldAsk(sdk = 33, granted = false, joined = false, askedBefore = false))
        assertFalse(NotificationAsk.shouldAsk(sdk = 33, granted = true, joined = true, askedBefore = false))
        assertFalse(NotificationAsk.shouldAsk(sdk = 33, granted = false, joined = true, askedBefore = true))
        assertFalse(NotificationAsk.shouldAsk(sdk = 32, granted = false, joined = true, askedBefore = false))
    }
}
