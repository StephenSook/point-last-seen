import Foundation
import Testing
@testable import PLSCore

/// route.stage "picklist": a person picked the report from a list; no model ran.
@Suite struct PicklistStageTests {
    @Test func aPicklistEventDecodesAndCounts() throws {
        var event = doc("p1", .cleared, effect: clearAC)
        event.route = RouteRecord(platform: .ios, path: .rules, stage: .guided, model: "none", reason: .onDeviceDefault, latencyMs: 0,
                                  sdkReported: false, blocked: nil, decidedAtMs: 0)
        guard case var .object(o) = try JSONValue(encoding: event), case var .object(route)? = o["route"] else {
            Issue.record("shape"); return
        }
        route["stage"] = .string("picklist")
        o["route"] = .object(route)
        let decoded = EventFilter.decode([.object(o)])
        #expect(decoded.malformedIds.isEmpty)
        #expect(decoded.docs.first?.route?.stage == .picklist)
        #expect(EventFilter.toEngineEvents(decoded.docs, priorInputEventIds: []).map(\.eventId) == ["p1"])
    }

    @Test func itsGlyphSaysNoModelRan() {
        let r = RouteRecord(platform: .ios, path: .rules, stage: .picklist, model: "none", reason: .onDeviceDefault, latencyMs: 0,
                            sdkReported: false, blocked: nil, decidedAtMs: 0)
        #expect(RouteMark.make(r).label == "Not sent to any model.")
    }
}
