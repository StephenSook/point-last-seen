import Foundation
import Testing
@testable import PLSCore

/// Runs every case of shared/test-vectors/grounding.json through the iPhone's grounding, built from
/// shared/constants/grounding-words.json (the rule is that file's `matching`).
@Suite struct GroundingTests {
    struct Case: Decodable { var name: String; var field: String; var note: String; var value: String; var expected: String }
    struct File: Decodable { var schemaVersion: Int; var note: String; var cases: [Case] }

    static func url(_ path: String) -> URL { VectorFile.sharedDir.appendingPathComponent(path) }
    static func grounding() throws -> Grounding { try Grounding(json: Data(contentsOf: url("constants/grounding-words.json"))) }
    func file() throws -> File { try JSONDecoder().decode(File.self, from: Data(contentsOf: Self.url("test-vectors/grounding.json"))) }

    @Test func theFileHasACaseKeptAndBlankedForEveryField() throws {
        let f = try file()
        #expect(f.schemaVersion == 1 && f.cases.count >= 26)
        for field in ["topColor", "bottomColor", "direction", "footwear", "carried"] {
            let cases = f.cases.filter { $0.field == field }
            #expect(cases.contains { $0.value == $0.expected } && cases.contains { $0.value != $0.expected }, "\(field)")
        }
    }

    /// Every key of the file and of its cases is read here: a new one fails this test until the iPhone runs it.
    @Test func everyKeyInTheFileIsRead() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.url("test-vectors/grounding.json"))) as? [String: Any] ?? [:]
        #expect(Set(root.keys) == ["schemaVersion", "note", "cases"], "\(root.keys.sorted())")
        let keys = Set(((root["cases"] as? [[String: Any]]) ?? []).flatMap(\.keys))
        #expect(keys == ["name", "field", "note", "value", "expected"], "\(keys.sorted())")
    }

    @Test func everyCaseGroundsItsFieldAndLeavesTheRestBlank() throws {
        let g = try Self.grounding()
        for c in try file().cases {
            var r = ReportReading.unclear()
            switch c.field {
            case "topColor": r.topColor = try #require(ClothingColor(rawValue: c.value), "\(c.name)")
            case "bottomColor": r.bottomColor = try #require(ClothingColor(rawValue: c.value), "\(c.name)")
            case "direction": r.direction = try #require(Direction(rawValue: c.value), "\(c.name)")
            case "footwear": r.footwear = c.value
            case "carried": r.carried = c.value
            default: Issue.record("unknown field \(c.field) in \(c.name)")
            }
            let out = g.ground(r, note: c.note)
            let got: [String: String] = ["topColor": out.topColor.rawValue, "bottomColor": out.bottomColor.rawValue,
                                         "direction": out.direction.rawValue, "footwear": out.footwear, "carried": out.carried]
            let blank: [String: String] = ["topColor": "unknown", "bottomColor": "unknown", "direction": "unknown", "footwear": "", "carried": ""]
            for (field, value) in got {
                #expect(value == (field == c.field ? c.expected : blank[field]), "\(c.name): \(field) is \(value)")
            }
        }
    }
}
