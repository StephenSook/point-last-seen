package app.pointlastseen.family.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PaperSchemeTest {
    private fun hex(c: Color) = "#%06X".format(c.toArgb() and 0xFFFFFF)
    private val s = Paper.scheme()

    @Test fun everyContainerAndItsContentReachFourAndAHalfToOne() {
        val pairs = mapOf(
            "background" to (s.background to s.onBackground),
            "surface" to (s.surface to s.onSurface),
            "surfaceVariant" to (s.surfaceVariant to s.onSurfaceVariant),
            "primary" to (s.primary to s.onPrimary),
            "secondaryContainer" to (s.secondaryContainer to s.onSecondaryContainer),
            "primaryContainer" to (s.primaryContainer to s.onPrimaryContainer),
        )
        for ((name, p) in pairs) {
            val r = Contrast.ratio(hex(p.first), hex(p.second))
            assertTrue("$name ${hex(p.first)} on ${hex(p.second)} is $r", r >= 4.5)
        }
    }

    @Test fun aSelectedChipIsInkWithPaperTextNotMaterialLavender() {
        assertEquals(PaperTokens.INK, hex(s.secondaryContainer))
        assertEquals(PaperTokens.BACKGROUND, hex(s.onSecondaryContainer))
    }

    @Test fun surfacesAreAllPaper() {
        for (c in listOf(s.surfaceContainer, s.surfaceContainerLow, s.surfaceContainerHigh, s.surfaceContainerHighest, s.surfaceContainerLowest)) {
            assertEquals(PaperTokens.BACKGROUND, hex(c))
        }
    }
}
