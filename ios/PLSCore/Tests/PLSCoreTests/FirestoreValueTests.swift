import Foundation
import Testing
@testable import PLSCore

@Suite struct FirestoreValueTests {
    @Test func wholeNumbersBecomeIntegersAndFractionsStayDoubles() {
        let v = JSONValue.object(["seq": .number(1_795_860_000_001), "pod": .number(0.5), "one": .number(1),
                                  "flag": .bool(true), "none": .null, "list": .array([.number(2), .string("a")])])
        let o = v.firestoreValue as? [String: Any]
        #expect(o?["seq"] as? Int64 == 1_795_860_000_001)
        #expect(o?["pod"] as? Double == 0.5)
        #expect(o?["one"] as? Int64 == 1)
        #expect(o?["flag"] as? Bool == true)
        #expect(o?["none"] is NSNull)
        #expect((o?["list"] as? [Any])?.first as? Int64 == 2)
    }

    @Test func theServerIdentityIsReadFromADocument() throws {
        let d = doc("e1", .cleared, effect: clearAC)
        #expect(EventIdentity(json: try JSONValue(encoding: d)) == d.identity)
        #expect(EventIdentity(json: .object(["deviceId": .string("D1")])) == nil)
    }

    @Test func outOfRangeNumbersAreRefusedNotACrash() {
        let huge: JSONValue = .object(["deviceId": .string("D1"), "seq": .number(1e300), "authorUid": .string("u"), "clientTimeMs": .number(1)])
        #expect(EventIdentity(json: huge) == nil)
        let fraction: JSONValue = .object(["deviceId": .string("D1"), "seq": .number(1.5), "authorUid": .string("u"), "clientTimeMs": .number(1)])
        #expect(EventIdentity(json: fraction) == nil)
        #expect(ModelProfile(shared: .object(["heightFt": .number(1e300), "heightIn": .number(2)])).heightFt == nil)
        let row: JSONValue = .object(["segmentId": .string("ROW"), "priorPoa": .number(1), "priorVersion": .number(1e300)])
        #expect(throws: PackSegments.PackError.badSegment("ROW")) { try PackSegments.parse([row]) }
        #expect(PoaClass.classify(poa: 1e300, maxPoa: 1e-300) == 5)
        #expect(PoaClass.percentLabel(1e300) == "100%")
    }
}
