package app.pointlastseen.family.ui.theme

import androidx.compose.animation.core.tween
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
}

/** Paper theme (spec 22.1): warm paper, dark ink, the system font. */
@Composable
fun PaperTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            background = Paper.background,
            surface = Paper.background,
            surfaceVariant = Paper.background,
            onBackground = Paper.ink,
            onSurface = Paper.ink,
            onSurfaceVariant = Paper.secondary,
            primary = Paper.ink,
            onPrimary = Paper.background,
            secondary = Paper.secondary,
            onSecondary = Paper.background,
            outline = Paper.secondary,
        ),
        content = content,
    )
}
