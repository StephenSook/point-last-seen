package app.pointlastseen.family.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedUrisTest {
    private val own = "app.pointlastseen.family"

    @Test fun aVideoFromAnotherAppsProviderIsAccepted() {
        assertTrue(SharedUris.acceptableClip("content", "media", "video/mp4", own))
        assertTrue(SharedUris.acceptableClip("content", "com.ring.provider", "video/quicktime", own))
    }

    @Test fun fileUrisAreRefusedSoAppPrivateFilesCannotBeSent() {
        assertFalse(SharedUris.acceptableClip("file", null, "video/mp4", own))
        assertFalse(SharedUris.acceptableClip(null, null, "video/mp4", own))
    }

    @Test fun thisAppsOwnProvidersAreRefused() {
        assertFalse(SharedUris.acceptableClip("content", own, "video/mp4", own))
        assertFalse(SharedUris.acceptableClip("content", "$own.fileprovider", "video/mp4", own))
        assertFalse(SharedUris.acceptableClip("content", "$own.firebaseinitprovider", "video/mp4", own))
    }

    @Test fun theResolvedTypeMustBeVideo() {
        assertFalse(SharedUris.acceptableClip("content", "media", "image/jpeg", own))
        assertFalse(SharedUris.acceptableClip("content", "media", null, own))
        assertFalse(SharedUris.acceptableClip("content", "media", "application/xml", own))
    }
}
