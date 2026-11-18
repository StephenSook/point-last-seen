import Foundation
import Testing
@testable import PLSCore

@Suite struct EventDocSchemaTests {
    func schemaKeys() throws -> Set<String> {
        let schema = try VectorFile.json("schemas/event.schema.json")
        guard case let .array(required)? = schema["required"] else { throw VectorInputError(description: "no required list") }
        return Set(required.compactMap { if case let .string(k) = $0 { k } else { nil } })
    }

    @Test func aClearWithoutGPSEncodesEverySchemaKeyWithNulls() throws {
        let d = doc("e1", .cleared, effect: clearAC)                 // position, observedAtMs, rawText, reading, route, ... are nil
        guard case let .object(o) = try JSONValue(encoding: d) else { Issue.record("not an object"); return }
        let keys = try schemaKeys()
        #expect(keys.count == 25)
        #expect(Set(o.keys) == keys)
        for k in ["position", "observedAtMs", "targetEventId", "decision", "planVersion", "serverTime", "rawText", "reading", "route"] {
            #expect(o[k] == .null, "\(k)")
        }
    }

    @Test func theEncodedEventDecodesBackUnchanged() throws {
        let d = doc("e2", .clue, effect: clue(.high))
        #expect(try JSONDecoder().decode(EventDoc.self, from: JSONEncoder().encode(d)) == d)
    }
}
