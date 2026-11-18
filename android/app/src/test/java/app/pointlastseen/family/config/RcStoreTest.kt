package app.pointlastseen.family.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RcStoreTest {
    private class FakeSource : RcSource {
        var values = mapOf<String, String>()
        var listener: (() -> Unit)? = null
        override fun snapshot() = values
        override fun start(onChange: () -> Unit) { listener = onChange }
    }

    @Test fun startsWithTheDefaultsBeforeAnyFetch() {
        val store = RcStore(FakeSource())
        assertEquals(RcValues.DEFAULTS, store.values.value)
    }

    @Test fun aRealTimeUpdatePublishesNewValues() {
        val src = FakeSource()
        val store = RcStore(src)
        store.start()
        src.values = mapOf("kill_cloud" to "true", "cloud_model_android" to "gemini-y")
        src.listener!!.invoke()
        assertTrue(store.values.value.killCloud)
        assertEquals("gemini-y", store.values.value.cloudModelAndroid)
    }

    @Test fun startPublishesWhatTheSourceAlreadyHas() {
        val src = FakeSource().apply { values = mapOf("kill_cloud" to "true") }
        val store = RcStore(src)
        store.start()
        assertTrue(store.values.value.killCloud)
    }
}
