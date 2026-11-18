package app.pointlastseen.family

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/**
 * Debug builds only: the App Check debug provider. Its token comes from the
 * firebase_app_check_debug_token resource, filled from the untracked local.properties.
 */
object AppCheckSetup {
    const val PROVIDER = "debug"

    fun factory(): AppCheckProviderFactory = DebugAppCheckProviderFactory.getInstance()
}
