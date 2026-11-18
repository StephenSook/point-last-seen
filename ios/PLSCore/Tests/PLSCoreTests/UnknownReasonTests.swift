import Foundation
import Testing
@testable import PLSCore

/// The rules bound route.reason by length only, so a newer client's reason can reach this phone.
/// The event must still count; only the reason is unknown.
@Suite struct UnknownReasonTests {
    @Test func anUnknownReasonKeepsTheEvent() throws {
        var event = doc("e1", .cleared, effect: clearAC)
        event.route = RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "m", reason: .noNetwork, latencyMs: 1,
                                  sdkReported: false, blocked: nil, decidedAtMs: 0)
        guard case var .object(o) = try JSONValue(encoding: event), case var .object(route)? = o["route"] else {
            Issue.record("shape"); return
        }
        route["reason"] = .string("a_future_reason")
        o["route"] = .object(route)
        let decoded = EventFilter.decode([.object(o)])
        #expect(decoded.malformedIds.isEmpty)
        #expect(decoded.docs.count == 1)
        #expect(decoded.docs.first?.route?.reason == .unknown)
    }

    @Test func aKnownReasonStillDecodesAsItself() throws {
        let data = try JSONEncoder().encode(RouteReason.notDrillMode)
        #expect(try JSONDecoder().decode(RouteReason.self, from: data) == .notDrillMode)
    }
}
