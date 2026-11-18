package app.pointlastseen.family

import app.pointlastseen.family.data.RouteRecord
import org.junit.Assert.assertEquals
import org.junit.Test

class TelemetryTest {
    private val route = RouteRecord("android", "cloud", "sdk", "gemini-3.5-flash-lite", "on_device_unavailable", 2569, true, null, 1_000L)

    private class FakeSink : TelemetrySink {
        val traces = mutableListOf<Triple<String, Map<String, String>, Long>>()
        val events = mutableListOf<Pair<String, Map<String, String>>>()
        override fun trace(name: String, attributes: Map<String, String>, latencyMs: Long) { traces += Triple(name, attributes, latencyMs) }
        override fun event(name: String, attributes: Map<String, String>) { events += name to attributes }
    }

    @Test fun aRouteRecordMapsToFourShortAttributesAndNoText() {
        assertEquals(mapOf("path" to "cloud", "reason" to "on_device_unavailable", "platform" to "android", "stage" to "sdk"), Telemetry.attributes(route))
    }

    @Test fun eachModelCallRecordsOneTraceAndOneEvent() {
        val sink = FakeSink()
        Telemetry(sink).record(route)
        assertEquals(listOf(Triple("hybrid-inference", Telemetry.attributes(route), 2569L)), sink.traces)
        assertEquals(listOf("inference_complete" to Telemetry.attributes(route)), sink.events)
    }

    @Test fun aSinkFailureNeverBreaksTheRead() {
        val broken = object : TelemetrySink {
            override fun trace(name: String, attributes: Map<String, String>, latencyMs: Long) = throw IllegalStateException("perf down")
            override fun event(name: String, attributes: Map<String, String>) = throw IllegalStateException("analytics down")
        }
        Telemetry(broken).record(route)
    }
}
