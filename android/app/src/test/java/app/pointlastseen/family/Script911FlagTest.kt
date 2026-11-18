package app.pointlastseen.family

import org.junit.Assert.assertTrue
import org.junit.Test

class Script911FlagTest {
    /**
     * The offline 911 script ships: "Call 911 first" offers "What to say" in the debug and release
     * builds. -Ppls.script911=false is the off switch. This test runs for both variants
     * (testDebugUnitTest and testReleaseUnitTest).
     */
    @Test fun theScriptScreenIsOnInTheShippedBuild() {
        assertTrue(BuildConfig.SCRIPT_911)
    }
}
