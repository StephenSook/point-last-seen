package app.pointlastseen.family.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClipRulesTest {
    private val mark = ConsentMark(byUid = "u1", atMs = 5L)
    private val sha = "a".repeat(64)
    private val full = ClipConsent(clipSha256 = sha, personInClip = mark, footageOwner = mark, cloudProcessing = mark, publicUse = null)

    @Test fun theCapIsFourteenMillionBytes() {
        assertEquals(14_000_000L, MAX_CLIP_BYTES)
    }

    @Test fun theEncodedSizeOfTheLargestClipStaysUnder20MB() {
        assertTrue(ClipRules.base64Size(MAX_CLIP_BYTES) < 20_000_000L)
    }

    @Test fun aClipOverTheCapIsRefusedWithTheNumber() {
        val msg = ClipRules.sizeProblem(14_000_001L)
        assertTrue(msg!!.contains("14,000,000"))
        assertNull(ClipRules.sizeProblem(14_000_000L))
        assertTrue(ClipRules.sizeProblem(0L) != null)
    }

    @Test fun threeConsentsAreRequiredAndPublicUseIsNot() {
        assertTrue(ClipRules.consentComplete(full, sha))
        assertFalse(ClipRules.consentComplete(full.copy(cloudProcessing = null), sha))
        assertFalse(ClipRules.consentComplete(full.copy(personInClip = null), sha))
        assertFalse(ClipRules.consentComplete(full.copy(footageOwner = null), sha))
    }

    @Test fun consentGivenForOneClipDoesNotCoverAnother() {
        assertFalse(ClipRules.consentComplete(full, "b".repeat(64)))
    }
}
