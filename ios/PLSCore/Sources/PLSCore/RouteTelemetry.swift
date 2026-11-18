import Foundation

/// The one Performance Monitoring trace each read records (P-15). It carries the route only:
/// path, stage, reason, model and any block, plus the latency. Never the report text, the
/// reading or anything about the subject. Firebase AI monitoring sees cloud calls only, so this
/// trace is how the on-device share and on-device latency can be shown at all.
public enum RouteTelemetry {
    public static let traceName = "report_read"
    /// Performance Monitoring keeps at most 5 attributes per trace and 100 characters a value.
    static let maxValueLength = 100
    static let maxLatencyMs: Double = 86_400_000

    public static func attributes(_ r: RouteRecord) -> [String: String] {
        let model = r.model.isEmpty ? "none" : String(r.model.prefix(maxValueLength))
        return ["path": r.path.rawValue, "stage": r.stage.rawValue, "reason": r.reason.rawValue, "model": model,
                "blocked": r.blocked?.rawValue ?? "none"]
    }

    public static func metrics(_ r: RouteRecord) -> [String: Int64] {
        // Capped at a day so a broken clock can never trap the conversion.
        let ms = r.latencyMs.isFinite ? min(max(0, r.latencyMs.rounded()), maxLatencyMs) : 0
        return ["latency_ms": Int64(ms)]
    }
}
