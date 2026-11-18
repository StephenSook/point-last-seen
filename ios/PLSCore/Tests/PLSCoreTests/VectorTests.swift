import Foundation
import Testing
@testable import PLSCore

/// Runs every case of shared/test-vectors/search.json through the Swift engine. The file is
/// required: a missing or unreadable file fails the suite, it never skips.
/// `PLS_SHARED_DIR` may point at another checkout's shared/ folder for local runs.
enum VectorFile {
    static var sharedDir: URL {
        if let dir = ProcessInfo.processInfo.environment["PLS_SHARED_DIR"] { return URL(fileURLWithPath: dir) }
        return URL(fileURLWithPath: #filePath)                       // ios/PLSCore/Tests/PLSCoreTests/VectorTests.swift
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("shared")
    }

    static func json(_ path: String) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: sharedDir.appendingPathComponent(path)))
    }

    static func load() -> (sections: [String], cases: [VectorCase], error: String?) {
        do {
            let v = try json("test-vectors/search.json")
            guard case let .array(names)? = v["sections"] else { return ([], [], "no sections list") }
            let sections = names.compactMap { if case let .string(s) = $0 { s } else { nil } }
            var cases: [VectorCase] = []
            for s in sections {
                guard case let .array(list)? = v[s] else { return (sections, [], "section \(s) missing") }
                for c in list {
                    guard case let .string(name)? = c["name"], let input = c["input"], let expected = c["expected"] else {
                        return (sections, [], "malformed case in \(s)")
                    }
                    cases.append(VectorCase(section: s, name: name, input: input, expected: expected))
                }
            }
            return (sections, cases, nil)
        } catch {
            return ([], [], "cannot read \(sharedDir.path)/test-vectors/search.json: \(error)")
        }
    }

    static let loaded = load()
}

struct VectorCase: Sendable, CustomTestStringConvertible {
    let section: String
    let name: String
    let input: JSONValue
    let expected: JSONValue
    var testDescription: String { "\(section)/\(name)" }
}

struct VectorInputError: Error, CustomStringConvertible { let description: String }

func field<T: Decodable>(_ input: JSONValue, _ key: String, as: T.Type = T.self) throws -> T {
    guard let v = input[key] else { throw VectorInputError(description: "input has no \(key)") }
    return try v.decode(T.self)
}

let evidenceScreen: EvidenceScreen? = {
    guard let data = try? Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/evidence-terms.json")) else { return nil }
    return try? EvidenceScreen(json: data)
}()

/// Encodes each engine function's output to JSON so the one comparer can check it.
func run(_ c: VectorCase) throws -> JSONValue {
    let i = c.input
    switch c.section {
    case "pod":
        return .number(SearchMath.pod(coverage: try field(i, "coverage")))
    case "trackLength":
        return .number(SearchMath.trackLength(minutes: try field(i, "minutes"), searchers: try field(i, "searchers"),
                                              searchType: try field(i, "searchType"), params: try field(i, "params")))
    case "ioc":
        return .number(SearchMath.ioc(try field(i, "influence"), authenticity: try field(i, "authenticity"), params: try field(i, "params")))
    case "posterior", "orderIndependence":
        return try JSONValue(encoding: Posterior.compute(prior: try field(i, "prior"), events: try field(i, "events"), params: try field(i, "params")))
    case "deriveEffect":
        let fn: String = try field(i, "fn")
        let reading: ReportReading = try field(i, "reading"), ctx: EffectContext = try field(i, "ctx")
        return try JSONValue(encoding: fn == "cleared"
            ? EffectDeriver.cleared(reading: reading, context: ctx, params: try field(i, "params"))
            : EffectDeriver.clue(reading: reading, context: ctx))
    case "docToEngine":
        // Stored events are decoded one by one, as the app reads them; malformed ones are skipped.
        let decoded = EventFilter.decode(try field(i, "docs", as: [JSONValue].self))
        return try JSONValue(encoding: EventFilter.toEngineEvents(decoded.docs, priorInputEventIds: try field(i, "priorInputEventIds")))
    case "rank":
        return try JSONValue(encoding: Ranking.rank(try field(i, "result"), prior: try field(i, "prior")))
    case "ids":
        switch try field(i, "fn", as: String.self) {
        case "eventId":
            return .object(["eventId": .string(EventID.make(incidentId: try field(i, "incidentId"), deviceId: try field(i, "deviceId"), seq: try field(i, "seq")))])
        case "eventSet":
            let h = EventSet.hash(priorVersion: try field(i, "priorVersion"), eventIds: try field(i, "eventIds"))
            return .object(["eventSetHash": .string(h), "convergenceCode": .string(EventSet.convergenceCode(h))])
        default:
            return .object(["convergenceCode": .string(EventSet.convergenceCode(try field(i, "hash")))])
        }
    case "router":
        if try field(i, "fn", as: String.self) == "decide" {
            return try JSONValue(encoding: RouterPolicy.decide(try field(i, "input")))
        }
        return try JSONValue(encoding: RouterPolicy.afterFailure(try field(i, "failure"), path: try field(i, "path"), stage: try field(i, "stage")))
    case "evidence":
        guard let evidenceScreen else { throw VectorInputError(description: "cannot read constants/evidence-terms.json") }
        return .bool(evidenceScreen.isPossibleEvidence(try field(i, "text")))
    default:
        throw VectorInputError(description: "unknown section \(c.section)")
    }
}

@Suite struct VectorTests {
    @Test func theVectorFileLoads() {
        #expect(VectorFile.loaded.error == nil, "\(VectorFile.loaded.error ?? "")")
        #expect(VectorFile.loaded.cases.count >= 52)
    }

    @Test func everySectionRan() {
        #expect(VectorFile.loaded.sections == ["pod", "trackLength", "ioc", "posterior", "orderIndependence", "deriveEffect",
                                               "docToEngine", "rank", "ids", "router", "evidence"])
        #expect(Set(VectorFile.loaded.cases.map(\.section)).count == 11)
    }

    @Test(arguments: VectorFile.loaded.cases)
    func vectorCase(_ c: VectorCase) throws {
        try expectVector(try run(c), c.expected)
    }
}
