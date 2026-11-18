import Foundation
import Testing
@testable import PLSCore

@Suite struct PlanTests {
    let json: JSONValue = .object([
        "version": .number(3), "basedOnEventSetHash": .string(String(repeating: "a", count: 64)), "priorVersion": .number(2),
        "assignments": .array([
            .object(["teamId": .string("T1"), "segmentIds": .array([.string("AC")]), "taskText": .string("Sweep AC"), "reason": .string("Highest priority")]),
            .object(["teamId": .string("T2"), "segmentIds": .array([.string("AD")]), "taskText": .string("Sweep AD"), "reason": .string("Next")])
        ]),
        "wordingRoute": .null, "approvedByUid": .string("cmd-1"), "approvedAt": .number(1_795_860_000_000), "createdClientTimeMs": .number(1_795_860_000_000)
    ])

    @Test func aPlanDecodesAndGivesEachTeamItsSegments() throws {
        let plan = try json.decode(PlanDoc.self)
        #expect(plan.version == 3)
        #expect(plan.assignment(for: "T2")?.segmentIds == ["AD"])
        #expect(plan.assignment(for: "T9") == nil)
    }

    @Test func aPlanEncodesExactlyTheSchemaKeys() throws {
        let schema = try VectorFile.json("schemas/plan.schema.json")
        guard case let .array(required)? = schema["required"], case let .object(o) = try JSONValue(encoding: try json.decode(PlanDoc.self)) else {
            Issue.record("setup"); return
        }
        #expect(Set(o.keys) == Set(required.compactMap { if case let .string(k) = $0 { k } else { nil } }))
    }
}
