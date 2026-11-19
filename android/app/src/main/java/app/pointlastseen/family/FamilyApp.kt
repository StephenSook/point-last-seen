package app.pointlastseen.family

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.appCheck

class FamilyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        app.pointlastseen.family.push.PlsMessagingService.createChannel(this)
        // FirebaseApp comes from google-services.json; a build without it has no Firebase.
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            Firebase.appCheck.installAppCheckProviderFactory(AppCheckSetup.factory())
        }
    }
}
