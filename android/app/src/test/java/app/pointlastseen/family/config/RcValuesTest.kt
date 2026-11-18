package app.pointlastseen.family.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RcValuesTest {
    @Test fun defaultsMatchTheSpec() {
        val d = RcValues.DEFAULTS
        assertEquals("gemini-3.5-flash-lite", d.cloudModelAndroid)
        assertEquals("gemini-3.5-flash-lite", d.clipModel)
        assertFalse(d.killCloud)
        assertTrue(d.useLimitedUseTokens)
        assertEquals(0L, d.minimumVersionAndroid)
    }

    @Test fun valuesParseFromStrings() {
        val v = RcValues.from(mapOf("kill_cloud" to "true", "cloud_model_android" to "gemini-x", "minimum_version_android" to "3", "use_limited_use_tokens" to "false"))
        assertTrue(v.killCloud)
        assertEquals("gemini-x", v.cloudModelAndroid)
        assertEquals("gemini-3.5-flash-lite", v.clipModel)
        assertEquals(3L, v.minimumVersionAndroid)
        assertFalse(v.useLimitedUseTokens)
    }

    @Test fun badValuesFallBackToDefaults() {
        val v = RcValues.from(mapOf("kill_cloud" to "maybe", "minimum_version_android" to "x", "cloud_model_android" to " "))
        assertFalse(v.killCloud)
        assertEquals(0L, v.minimumVersionAndroid)
        assertEquals("gemini-3.5-flash-lite", v.cloudModelAndroid)
    }

    @Test fun anOldBuildIsAskedToUpdate() {
        assertTrue(RcValues.DEFAULTS.copy(minimumVersionAndroid = 2).needsUpdate(versionCode = 1))
        assertFalse(RcValues.DEFAULTS.copy(minimumVersionAndroid = 1).needsUpdate(versionCode = 1))
    }
}
