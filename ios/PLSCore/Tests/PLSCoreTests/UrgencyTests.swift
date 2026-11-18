import Foundation
import Testing
@testable import PLSCore

/// P-12: the urgency chip from a temperature and a wet answer typed at command. Search urgency
/// only, never treatment advice; clothing does not enter.
@Suite struct UrgencyTests {
    @Test func everySharedVectorAgrees() throws {
        let rule = try UrgencyRule(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/urgency.json")))
        let vectors = try VectorFile.json("test-vectors/urgency.json")
        guard case let .array(cases)? = vectors["cases"] else { Issue.record("no cases"); return }
        #expect(cases.count >= 7)
        for c in cases {
            let temp: Double? = { if case let .number(n)? = c["input"]?["tempF"] { n } else { nil } }()
            let wet: Bool? = { if case let .bool(b)? = c["input"]?["wet"] { b } else { nil } }()
            guard case let .string(expected)? = c["expected"], case let .string(name)? = c["name"] else { Issue.record("shape"); continue }
            #expect(rule.level(tempF: temp, wet: wet).rawValue == expected, "\(name)")
        }
    }

    @Test func theChipCarriesItsWordsAndItsSource() throws {
        let rule = try UrgencyRule(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/urgency.json")))
        #expect(rule.coldF == 40)
        #expect(UrgencyLevel.cold.chipText == "Cold raises urgency")
        #expect(UrgencyLevel.coolWet.chipText == "Cool and wet raises urgency")
        #expect(UrgencyLevel.none.chipText == nil)
        #expect(rule.sourceLine.hasPrefix("CDC: \"While hypothermia"))
        #expect(rule.sourceLine.contains("(read 2026-11-18)"))
    }

    @Test func aNonsenseTemperatureGivesNoChip() throws {
        let rule = try UrgencyRule(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/urgency.json")))
        #expect(rule.level(tempF: .nan, wet: true) == .none)
        #expect(rule.level(tempF: .infinity, wet: true) == .none)
    }
}
