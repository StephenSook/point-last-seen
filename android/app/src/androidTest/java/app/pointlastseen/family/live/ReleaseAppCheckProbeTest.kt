package app.pointlastseen.family.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.AppCheckSetup
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.NoteMode
import app.pointlastseen.family.config.RcValues
import app.pointlastseen.family.data.FirebaseSignIn
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Release only (-Ppls.testBuildType=release): does the release provider pass on this device? Logs
 * PLS-PROBE lines with the outcome and error text, never a token. Then one cloud note call, which
 * App Check enforcement on AI Logic accepts only with a valid token.
 */
@RunWith(AndroidJUnit4::class)
class ReleaseAppCheckProbeTest {
    private fun log(s: String) = Log.i("PLS-PROBE", s)

    @Test fun theReleaseProviderGetsATokenAndACloudCallIsAccepted(): Unit = runBlocking {
        assumeTrue("release builds only", AppCheckSetup.PROVIDER != "debug")
        val token = runCatching { withTimeout(60_000) { Firebase.appCheck.getLimitedUseAppCheckToken().await() } }
        token.fold(
            onSuccess = { log("appcheck release provider=${AppCheckSetup.PROVIDER} ok length=${it.token.length}") },
            onFailure = { log("appcheck release provider=${AppCheckSetup.PROVIDER} error=${it::class.simpleName}: ${it.message}") },
        )
        val signedIn = runCatching { withTimeout(30_000) { FirebaseSignIn.ensureSignedIn() } }
        log("signin ${if (signedIn.isSuccess) "ok" else "error=${signedIn.exceptionOrNull()?.message}"}")
        val reply = runCatching {
            withTimeout(90_000) { AiClient { RcValues.DEFAULTS }.familyNote.structure(NoteMode.PREFER_ON_DEVICE, FamilyNote.prompt("She likes to walk to the old mill on Sundays.")) }
        }
        reply.fold(
            onSuccess = { log("cloud note ok source=${it.source} latencyMs=${it.latencyMs} hasText=${it.text != null}") },
            onFailure = { log("cloud note error=${it::class.simpleName}: ${it.message?.take(300)}") },
        )
        check(token.isSuccess && reply.isSuccess) { "the release provider did not pass on this device" }
    }
}
