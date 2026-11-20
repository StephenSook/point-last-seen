package app.pointlastseen.family.core

import android.content.Context

/** The shared language word lists, shipped in the app's assets by the build. */
object LanguageWords {
    const val ASSET = "language-words.json"

    /** The screen, or [LanguageScreen.UNLOADED] (which refuses every note for the cloud) when the asset is missing or unreadable. */
    fun screen(context: Context): LanguageScreen = runCatching {
        LanguageScreen.parse(context.assets.open(ASSET).bufferedReader().use { it.readText() })
    }.getOrDefault(LanguageScreen.UNLOADED)
}
