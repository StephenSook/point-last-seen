import FirebaseFirestore
import Foundation
import PLSCore
import Testing
@testable import PLS

/// A plan counts only when its stored `version` is a whole number. A Timestamp (which becomes
/// epoch milliseconds once converted) or any other type would otherwise read as a huge version
/// and hide every later plan.
@Suite struct FirestorePlanTests {
    func plan(version: Any) -> [String: Any] {
        ["version": version, "basedOnEventSetHash": "h", "priorVersion": 5, "assignments": [Any](),
         "approvedByUid": "cmd", "approvedAt": 2000, "createdClientTimeMs": 1500]
    }

    @Test func aWholeNumberVersionIsAPlan() {
        #expect(FirestoreJSON.plan(plan(version: 3))?["version"] == .number(3))
        #expect(FirestoreJSON.plan(plan(version: NSNumber(value: 18)))?["version"] == .number(18))
    }

    @Test func anyOtherVersionIsNoPlan() {
        #expect(FirestoreJSON.plan(plan(version: Timestamp(seconds: 1_800_000_000, nanoseconds: 0))) == nil)
        #expect(FirestoreJSON.plan(plan(version: "3")) == nil)
        #expect(FirestoreJSON.plan(plan(version: true)) == nil)
        #expect(FirestoreJSON.plan(plan(version: 2.5)) == nil)
        #expect(FirestoreJSON.plan(plan(version: -1)) == nil)
        var missing = plan(version: 1)
        missing["version"] = nil
        #expect(FirestoreJSON.plan(missing) == nil)
    }
}
