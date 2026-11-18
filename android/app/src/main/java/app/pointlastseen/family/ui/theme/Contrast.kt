package app.pointlastseen.family.ui.theme

import kotlin.math.pow

/** WCAG 2 contrast ratio between two "#RRGGBB" colors. */
object Contrast {
    private fun channel(c: Int): Double {
        val s = c / 255.0
        return if (s <= 0.04045) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
    }

    fun luminance(hex: String): Double {
        val v = hex.removePrefix("#").toInt(16)
        return 0.2126 * channel(v shr 16 and 0xFF) + 0.7152 * channel(v shr 8 and 0xFF) + 0.0722 * channel(v and 0xFF)
    }

    fun ratio(a: String, b: String): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }
}

/** Paper theme tokens for the family app (spec section 22.1). */
object PaperTokens {
    const val BACKGROUND = "#EBE7E2"
    const val INK = "#292624"
    const val SECONDARY = "#585452"
    const val CROSSFADE_MS = 350
}
