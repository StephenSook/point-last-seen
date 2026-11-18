package app.pointlastseen.family.core

import android.content.Context

/** Loads the shared possible-evidence terms the build copies into the app's assets. */
object EvidenceTerms {
    const val ASSET = "evidence-terms.json"

    /** The term list, or null when the asset is missing or unreadable (the screen then fails closed). */
    fun load(context: Context): List<String>? = runCatching {
        context.assets.open(ASSET).bufferedReader().use { it.readText() }
    }.getOrNull()?.let { EvidenceScreen.parseTerms(it) }

    fun screen(context: Context): EvidenceScreen = EvidenceScreen(load(context))
}
