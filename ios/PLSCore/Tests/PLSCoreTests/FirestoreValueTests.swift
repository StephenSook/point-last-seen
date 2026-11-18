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
}
