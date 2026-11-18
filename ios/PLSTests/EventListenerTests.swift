import FirebaseFirestore
import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct FirestoreJSONTests {
    @Test func firestoreValuesBecomeJSONWithBooleansKeptApart() {
        let v = FirestoreJSON.value(["seq": NSNumber(value: 7), "pod": NSNumber(value: 0.5), "isTrainingInject": NSNumber(value: false),
                                     "rawText": "x", "position": NSNull(), "list": [NSNumber(value: true)],
                                     "serverTime": Timestamp(seconds: 1_700_000_000, nanoseconds: 500_000_000)] as [String: Any])
        #expect(v["seq"] == .number(7))
        #expect(v["pod"] == .number(0.5))
        #expect(v["isTrainingInject"] == .bool(false))
        #expect(v["rawText"] == .string("x"))
        #expect(v["position"] == .null)
        #expect(v["list"] == .array([.bool(true)]))
        #expect(v["serverTime"] == .number(1_700_000_000_500))
    }
}

/// The events listener (includeMetadataChanges): every member's reports for the posterior, and
/// this phone's own writes settled when the server copy arrives.
@MainActor
@Suite struct EventListenerTests {
    func doc(_ device: String, _ seq: Int, author: String? = nil) -> EventDoc {
        EventDoc(eventId: EventID.make(incidentId: "I1", deviceId: device, seq: seq), schemaVersion: 1, incidentId: "I1", teamId: "T1",
                 deviceId: device, seq: seq, authorUid: author ?? device, role: .searcher, type: .clue, reporter: .searcher, clientTimeMs: 1_000,
                 serverTime: 1_500, observedAtMs: nil, position: nil, positionSource: .none, rawText: "x", inputMethod: .typed,
                 isTrainingInject: false, reading: nil, effect: .none(why: .needsCommand), route: nil, targetEventId: nil,
                 decision: nil, planVersion: nil, priorVersion: 1)
    }
    func json(_ d: EventDoc) throws -> JSONValue { try JSONValue(encoding: d) }
    func store(_ server: FakeEventServer) throws -> EventStore {
        try EventStore(server: server, outboxURL: FileManager.default.temporaryDirectory.appendingPathComponent("lis-\(UUID().uuidString).json"))
    }

    @Test func theServerCopyWithNoPendingWritesSettlesOurEntry() throws {
        let server = FakeEventServer(); server.holdWrites = true                       // offline: no write callback
        let s = try store(server)
        let mine = doc("uid-1", 1)
        try s.append(mine)
        s.listen(incidentId: "I1")
        server.push([(try json(mine), true)])                                          // our queued copy: no answer yet
        #expect(s.entries.first?.state == .pending)
        server.push([(try json(mine), false)])                                         // the server has it
        #expect(s.entries.first?.state == .acked)
    }

    @Test func otherMembersReportsReachTheTeamListAndBrokenOnesAreCounted() throws {
        let server = FakeEventServer()
        let s = try store(server)
        s.listen(incidentId: "I1")
        server.push([(try json(doc("uid-2", 4)), false), (.object(["eventId": .string("bad")]), false)])
        #expect(s.teamEvents.map(\.deviceId) == ["uid-2"])
        #expect(s.malformedCount == 1)
        #expect(server.listenedTo == ["I1"])
    }
}
