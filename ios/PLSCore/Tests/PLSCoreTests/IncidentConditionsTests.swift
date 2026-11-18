import Foundation
import Testing
@testable import PLSCore

/// The incident's `conditions`, typed at command: the urgency chip's inputs.
@Suite struct IncidentConditionsTests {
    func rule() throws -> UrgencyRule {
        try UrgencyRule(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/urgency.json")))
    }

    @Test func decodesAndWritesAllThreeKeys() throws {
        let c = try JSONDecoder().decode(IncidentConditions.self, from: Data(#"{"tempF":41,"wet":true,"setAtMs":1700}"#.utf8))
        #expect(c == IncidentConditions(tempF: 41, wet: true, setAtMs: 1700))
        let blank = IncidentConditions(tempF: nil, wet: nil, setAtMs: 5)
        guard case let .object(o) = try JSONValue(encoding: blank) else { Issue.record("not an object"); return }
        #expect(Set(o.keys) == ["tempF", "wet", "setAtMs"])
        #expect(o["tempF"] == .null && o["wet"] == .null)
    }

    @Test func noConditionsGiveNoChip() throws {
        #expect(try rule().level(conditions: nil) == .none)
        #expect(try rule().level(conditions: IncidentConditions(tempF: 40, wet: false, setAtMs: 1)) == .cold)
        #expect(try rule().level(conditions: IncidentConditions(tempF: 41, wet: true, setAtMs: 1)) == .coolWet)
    }

    @Test func theIncidentDocumentsConditionsFieldIsReadLeniently() throws {
        #expect(IncidentConditions(incidentField: .object(["tempF": .number(39), "wet": .null, "setAtMs": .number(2)]))
                == IncidentConditions(tempF: 39, wet: nil, setAtMs: 2))
        #expect(IncidentConditions(incidentField: nil) == nil)
        #expect(IncidentConditions(incidentField: .string("cold")) == nil)
    }
}
