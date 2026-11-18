package app.pointlastseen.family

import org.junit.Assert.assertFalse
import org.junit.Test

class Script911FlagTest {
    /** The 911 script screen ships only when Stephen says yes (promotion P-14). */
    @Test fun theScriptScreenIsOffInTheDefaultBuild() {
        assertFalse(BuildConfig.SCRIPT_911)
    }
}
