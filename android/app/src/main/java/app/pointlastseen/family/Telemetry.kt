package app.pointlastseen.family

import android.os.Bundle
import app.pointlastseen.family.data.RouteRecord
import com.google.firebase.Firebase
import com.google.firebase.analytics.analytics
import com.google.firebase.perf.performance

/** Where telemetry goes: Firebase Performance traces and Analytics events. */
interface TelemetrySink {
    fun trace(name: String, attributes: Map<String, String>, latencyMs: Long)
    fun event(name: String, attributes: Map<String, String>)
}

/**
 * One trace "hybrid-inference" and one event "inference_complete" per model call
 * (plan Task 27), with four short attributes from the route record and never any
 * note, clip or profile text. AI monitoring shows no on-device calls, so this is
 * how the on-device share and latency can be shown at all.
 */
class Telemetry(private val sink: TelemetrySink) {
    fun record(route: RouteRecord) {
        val attrs = attributes(route)
        runCatching { sink.trace(TRACE, attrs, route.latencyMs) }
        runCatching { sink.event(EVENT, attrs) }
    }

    companion object {
        const val TRACE = "hybrid-inference"
        const val EVENT = "inference_complete"

        fun attributes(r: RouteRecord): Map<String, String> =
            linkedMapOf("path" to r.path, "reason" to r.reason, "platform" to r.platform, "stage" to r.stage)
    }
}

class FirebaseTelemetrySink : TelemetrySink {
    override fun trace(name: String, attributes: Map<String, String>, latencyMs: Long) {
        val t = Firebase.performance.newTrace(name)
        attributes.forEach { (k, v) -> t.putAttribute(k, v) }
        t.start()
        t.putMetric("latency_ms", latencyMs)
        t.stop()
    }

    override fun event(name: String, attributes: Map<String, String>) {
        Firebase.analytics.logEvent(name, Bundle().apply { attributes.forEach { (k, v) -> putString(k, v) } })
    }
}
