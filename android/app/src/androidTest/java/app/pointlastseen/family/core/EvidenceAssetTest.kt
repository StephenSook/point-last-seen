package app.pointlastseen.family.core

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EvidenceAssetTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun theSharedTermListShipsInsideTheApp() {
        val terms = EvidenceTerms.load(context)
        assertTrue("terms: ${terms?.size}", (terms?.size ?: 0) >= 40)
    }

    @Test fun theLoadedScreenFlagsEvidenceAndPassesANormalNote() {
        val screen = EvidenceTerms.screen(context)
        assertTrue(screen.isPossibleEvidence("We found a shell casing by the fence"))
        assertFalse(screen.isPossibleEvidence("She likes to walk to the old mill"))
    }
}
