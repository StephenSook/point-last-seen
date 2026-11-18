import Foundation
import Testing
@testable import PLSCore

/// What each read sends to Performance Monitoring: the route only, never the report, the
/// reading or anything about the subject. AI monitoring cannot see on-device reads, so this
/// trace is how the on-device share and latency are shown at all (P-15).
@Suite struct RouteTelemetryTests {
    func route(model: String = "AFM 3 Core Advanced", latency: Double = 851.6, blocked: BlockKind? = nil) -> RouteRecord {
        RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: model, reason: .noNetwork, latencyMs: latency,
                    sdkReported: false, blocked: blocked, decidedAtMs: 0)
    }

    @Test func theRouteBecomesFiveAttributesAndALatency() {
        #expect(RouteTelemetry.traceName == "report_read")
        #expect(RouteTelemetry.attributes(route()) == ["path": "on_device", "stage": "guided", "reason": "no_network",
                                                       "model": "AFM 3 Core Advanced", "blocked": "none"])
        #expect(RouteTelemetry.attributes(route(blocked: .guardrail))["blocked"] == "guardrail")
        #expect(RouteTelemetry.metrics(route()) == ["latency_ms": 852])
    }

    @Test func everyPossibleRouteFitsTheSDKLimits() {
        for path in RoutePath.allCases {
            for stage in ReadStage.allCases {
                for reason in RouteReason.allCases {
                    let a = RouteTelemetry.attributes(RouteRecord(platform: .ios, path: path, stage: stage, model: String(repeating: "m", count: 300),
                                                                 reason: reason, latencyMs: 1, sdkReported: false, blocked: .refusal, decidedAtMs: 0))
                    #expect(a.count <= 5)
                    for (k, v) in a {
                        #expect(k.count <= 40 && !k.hasPrefix("_") && !k.hasPrefix("firebase_") && !k.hasPrefix("google_") && !k.hasPrefix("ga_"))
                        #expect(k.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") })
                        #expect(!v.isEmpty && v.count <= 100)
                    }
                }
            }
        }
    }

    @Test func aStrangeLatencyIsNeverSentAsGarbage() {
        #expect(RouteTelemetry.metrics(route(latency: -5)) == ["latency_ms": 0])
        #expect(RouteTelemetry.metrics(route(latency: .nan)) == ["latency_ms": 0])
        #expect(RouteTelemetry.metrics(route(latency: .infinity)) == ["latency_ms": 0])
        #expect(RouteTelemetry.metrics(route(latency: 1e30)) == ["latency_ms": 86_400_000])      // capped at a day, no trap
    }
}
