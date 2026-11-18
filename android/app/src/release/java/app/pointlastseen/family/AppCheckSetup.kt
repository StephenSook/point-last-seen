package app.pointlastseen.family

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/** Release builds: Play Integrity. No debug provider or token is in a release APK. */
object AppCheckSetup {
    const val PROVIDER = "play_integrity"

    fun factory(): AppCheckProviderFactory = PlayIntegrityAppCheckProviderFactory.getInstance()
}
