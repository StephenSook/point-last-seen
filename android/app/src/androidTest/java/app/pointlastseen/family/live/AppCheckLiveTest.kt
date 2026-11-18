package app.pointlastseen.family.live

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.AppCheckSetup
import com.google.android.gms.tasks.Tasks
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** Live: exchanges this debug build's registered debug token for an App Check token. */
@RunWith(AndroidJUnit4::class)
class AppCheckLiveTest {
    @Test fun debugBuildsUseTheDebugProvider() {
        assertEquals("debug", AppCheckSetup.PROVIDER)
    }

    @Test fun theDebugTokenIsAcceptedByAppCheck() {
        val token = Tasks.await(Firebase.appCheck.getAppCheckToken(true), 30, TimeUnit.SECONDS)
        assertTrue("App Check token length ${token.token.length}", token.token.length > 100)
        assertTrue(token.expireTimeMillis > System.currentTimeMillis())
    }
}
