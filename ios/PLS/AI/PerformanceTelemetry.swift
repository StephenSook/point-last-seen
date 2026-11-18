import FirebasePerformance
import PLSCore

/// Sends one `report_read` trace per read to Performance Monitoring: the route only (path,
/// stage, reason, model, block) and the latency, from `RouteTelemetry`. Never report text.
enum PerformanceTelemetry {
    static func record(_ route: RouteRecord) {
        guard let trace = Performance.startTrace(name: RouteTelemetry.traceName) else { return }
        for (name, value) in RouteTelemetry.attributes(route) { trace.setValue(value, forAttribute: name) }
        for (name, value) in RouteTelemetry.metrics(route) { trace.setValue(value, forMetric: name) }
        trace.stop()
    }
}
