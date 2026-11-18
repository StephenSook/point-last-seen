import FirebaseFirestore
import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct EventStorePayloadTests {
    func event() -> EventDoc {
        EventDoc(eventId: EventID.make(incidentId: "I1", deviceId: "uid-1", seq: 1_795_860_000_001), schemaVersion: 1,
                 incidentId: "I1", teamId: "T1", deviceId: "uid-1", seq: 1_795_860_000_001, authorUid: "uid-1", role: .searcher,
                 type: .cleared, reporter: .searcher, clientTimeMs: 1_795_860_000_500, serverTime: nil, observedAtMs: nil,
                 position: nil, positionSource: .assignedSegment, rawText: "cleared AC", inputMethod: .typed, isTrainingInject: false,
                 reading: nil, effect: .none(why: .needsCommand), route: nil, targetEventId: nil, decision: nil, planVersion: nil,
                 priorVersion: 1)
    }

    @Test func thePayloadHasAll25KeysAServerTimestampAndAnIntegerSeq() throws {
        let data = try EventStore.payload(for: event())
        #expect(data.count == 25)
        #expect(data["serverTime"] is FieldValue)
        #expect(data["seq"] as? Int64 == 1_795_860_000_001)
        #expect(data["position"] is NSNull)
        #expect(data["deviceId"] as? String == "uid-1")
    }

    @Test func theServerIdentityIsReadFromAFirestoreDictionary() {
        let e = event()
        let server: [String: Any] = ["deviceId": "uid-1", "seq": NSNumber(value: e.seq), "authorUid": "uid-1", "clientTimeMs": NSNumber(value: e.clientTimeMs)]
        #expect(EventStore.identity(from: server) == e.identity)
        #expect(EventStore.identity(from: ["deviceId": "uid-1"]) == nil)
    }
}
