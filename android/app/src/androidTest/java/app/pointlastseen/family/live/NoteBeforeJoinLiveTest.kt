package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.NoteEnv
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.config.RcValues
import app.pointlastseen.family.core.EvidenceTerms
import app.pointlastseen.family.core.LanguageWords
import app.pointlastseen.family.data.FirebaseSignIn
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Live, run on request: "I remembered something" before the family has joined, against the
 * deployed project, whose AI Logic requires a signed-in user. The note signs in first, then
 * reaches the cloud. Logs PLS-PROBE lines with outcomes only.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class NoteBeforeJoinLiveTest {
    @Test fun aNoteBeforeJoiningSignsInThenReachesTheCloud(): Unit = runBlocking {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        Firebase.auth.signOut()
        Log.i("PLS-PROBE", "note before join: signed in before=${Firebase.auth.currentUser != null}")
        val env = NoteEnv(status = DeviceModelStatus.UNAVAILABLE, cloudConsent = true, killCloud = false, nowMs = System::currentTimeMillis, modelName = RcValues.DEFAULTS.cloudModelAndroid)
        val out = withTimeout(90_000) {
            FamilyNote(AiClient { RcValues.DEFAULTS }.familyNote, EvidenceTerms.screen(ctx), FirebaseSignIn, LanguageWords.screen(ctx)).read("She likes to walk to the old mill on Sundays.", env)
        }
        val route = (out as? NoteOutcome.Read)?.route
        Log.i("PLS-PROBE", "note before join: outcome=${out::class.simpleName} path=${route?.path} latencyMs=${route?.latencyMs} signed in after=${Firebase.auth.currentUser != null}")
        assertTrue("outcome $out", out is NoteOutcome.Read && route?.path == "cloud")
    }
}
