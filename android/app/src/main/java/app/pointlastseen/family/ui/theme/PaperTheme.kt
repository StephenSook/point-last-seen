package app.pointlastseen.family.ui.theme

import androidx.compose.animation.core.tween
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private fun hex(s: String) = Color(s.removePrefix("#").toLong(16) or 0xFF000000)

object Paper {
    val background = hex(PaperTokens.BACKGROUND)
    val ink = hex(PaperTokens.INK)
    val secondary = hex(PaperTokens.SECONDARY)

    /** The family app's only motion: a 350 ms cross-fade (no spring). */
    fun <T> crossfade() = tween<T>(PaperTokens.CROSSFADE_MS)

    /**
     * Every slot the app's Material components read is paper, ink or secondary, so no
     * Material default (such as the lavender selected chip) shows. A selected chip is
     * ink with paper text: "on" shows by contrast, not by tint.
     */
    fun scheme(): ColorScheme = lightColorScheme(
        background = background,
        onBackground = ink,
        surface = background,
        onSurface = ink,
        surfaceVariant = background,
        onSurfaceVariant = secondary,
        surfaceContainerLowest = background,
        surfaceContainerLow = background,
        surfaceContainer = background,
        surfaceContainerHigh = background,
        surfaceContainerHighest = background,
        surfaceTint = background,
        primary = ink,
        onPrimary = background,
        primaryContainer = ink,
        onPrimaryContainer = background,
        secondary = secondary,
        onSecondary = background,
        secondaryContainer = ink,
        onSecondaryContainer = background,
        outline = secondary,
        outlineVariant = secondary,
    )
}

/** Paper theme (spec 22.1): warm paper, dark ink, the system font. */
@Composable
fun PaperTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Paper.scheme(), content = content)
}
