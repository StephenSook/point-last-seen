import Foundation
import Testing
@testable import PLSCore

/// Lane A's sample of real `pack-segments` documents from the drill incident, kept in Firestore's
/// typed REST form, read the way the iOS Firestore SDK hands them to the app (every number a
/// plain number, an empty array an empty array).
@Suite struct PackSegmentsSampleTests {
    static let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("shared/test-vectors/pack-segments-sample.json")

    /// Firestore's typed REST value as the SDK gives it to the app.
    static func plain(_ v: JSONValue) -> JSONValue {
        if case let .string(s)? = v["stringValue"] { return .string(s) }
        if case let .string(s)? = v["integerValue"], let n = Int64(s) { return .number(Double(n)) }
        if case let .number(n)? = v["doubleValue"] { return .number(n) }
        if case let .bool(b)? = v["booleanValue"] { return .bool(b) }
        if v["nullValue"] != nil { return .null }
        if let array = v["arrayValue"] {
            guard case let .array(values)? = array["values"] else { return .array([]) }
            return .array(values.map(plain))
        }
        if let map = v["mapValue"] {
            guard case let .object(fields)? = map["fields"] else { return .object([:]) }
            return .object(fields.mapValues(plain))
        }
        return v
    }

    static func sample() throws -> (incident: JSONValue, segments: [JSONValue]) {
        let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: file))
        guard case let .object(incidentFields)? = root["incident"]?["fields"], case let .array(docs)? = root["segments"] else {
            throw PackSegments.PackError.badSegment("sample shape")
        }
        let segments = docs.compactMap { doc -> JSONValue? in
            guard case let .object(fields)? = doc["fields"] else { return nil }
            return .object(fields.mapValues(plain))
        }
        return (.object(incidentFields.mapValues(plain)), segments)
    }

    @Test func theRealSegmentDocsParse() throws {
        let (incident, segments) = try Self.sample()
        #expect(segments.count == 3)
        let p = try PackSegments.parse(segments)
        #expect(p.grid.map(\.segmentId) == ["AA", "AC"])
        #expect(p.prior.map(\.segmentId) == ["AA", "AC", "ROW"])
        #expect(p.prior.allSatisfy { $0.priorPoa.isFinite && $0.priorPoa >= 0 })
        #expect(incident["priorVersion"] == .number(Double(p.priorVersion)) && p.priorVersion == 5)
        let aa = try #require(p.grid.first { $0.segmentId == "AA" })
        let ac = try #require(p.grid.first { $0.segmentId == "AC" })
        #expect(aa.upstream == ["AB"] && aa.downstream.isEmpty && ac.neighbors == ["AF", "AB"])
        #expect(p.grid.allSatisfy { $0.areaM2 > 0 })
    }

    @Test func eachRealCentroidFallsInItsOwnSegment() throws {
        let p = try PackSegments.parse(try Self.sample().segments)
        for s in p.grid {
            let here = Position(lat: s.centroid.lat, lon: s.centroid.lon, accuracyM: 5)
            #expect(Geo.segment(containing: here, in: p.grid) == s.segmentId, "\(s.segmentId)")
        }
    }
}
