package app.pointlastseen.family.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContrastTest {
    @Test fun paperPairsPass() {
        assertTrue(Contrast.ratio("#292624", "#EBE7E2") >= 12.2)
        assertTrue(Contrast.ratio("#585452", "#EBE7E2") >= 6.0)
    }

    @Test fun blackOnWhiteIs21AndOrderDoesNotMatter() {
        assertEquals(21.0, Contrast.ratio("#000000", "#FFFFFF"), 1e-9)
        assertEquals(Contrast.ratio("#585452", "#EBE7E2"), Contrast.ratio("#EBE7E2", "#585452"), 1e-12)
    }

    @Test fun thePaperTokensAreTheSpecValues() {
        assertEquals("#EBE7E2", PaperTokens.BACKGROUND)
        assertEquals("#292624", PaperTokens.INK)
        assertEquals("#585452", PaperTokens.SECONDARY)
        assertEquals(350, PaperTokens.CROSSFADE_MS)
    }
}
