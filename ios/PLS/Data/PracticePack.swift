import Foundation
import PLSCore

/// The practice drill's bundled search: the same documents a searcher's phone reads for a mission
/// (incident, segments, the approved plan and the shared profile), exported from the judge seed as
/// sample data. It lets anyone try the phone with no join code; nothing in it is a real search.
struct PracticePack: Sendable {
    static let version = 1

    /// Where the pack came from (export tool, source incident, plan, time), as the export wrote it.
    var provenance: JSONValue
    var incidentId: String
    var teamId: String
    var docs: MissionDocs

    enum Failure: Error, Equatable {
        case unreadable
        case version
        case missing(String)
    }

    /// The pack shipped inside the app; nil when this build has none.
    static var bundledURL: URL? { Bundle.main.url(forResource: "ios-practice-pack", withExtension: "json") }

    /// Where a practice drill keeps its reports and numbering: apart from the real journal, and
    /// emptied each time a drill starts or ends.
    nonisolated static func defaultDirectory() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PLS-practice", isDirectory: true)
    }

    static func load(from url: URL) throws -> PracticePack {
        let root: JSONValue
        do {
            root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        } catch {
            throw Failure.unreadable
        }
        guard case let .number(v)? = root["packVersion"], Int(exactly: v) == version else { throw Failure.version }
        func text(_ key: String) throws -> String {
            guard case let .string(s)? = root[key], !s.isEmpty else { throw Failure.missing(key) }
            return s
        }
        guard let provenance = root["provenance"], case let .object(p) = provenance, !p.isEmpty else { throw Failure.missing("provenance") }
        guard let incident = root["incident"], case .object = incident else { throw Failure.missing("incident") }
        guard case let .array(segments)? = root["segments"], !segments.isEmpty else { throw Failure.missing("segments") }
        let plan: JSONValue? = if case .object? = root["plan"] { root["plan"] } else { nil }
        let shared: JSONValue? = if case .object? = root["sharedProfile"] { root["sharedProfile"] } else { nil }
        return PracticePack(provenance: provenance, incidentId: try text("incidentId"), teamId: try text("teamId"),
                            docs: MissionDocs(incident: incident, segments: segments, plan: plan, sharedProfile: shared))
    }
}

/// The practice drill's journal server: nothing leaves the phone. A write never completes (the
/// report stays "On this phone only"), a read-back finds no server to ask, and nothing is listened to.
final class LocalOnlyEventServer: EventServer {
    func write(_ doc: EventDoc, completion: @escaping @MainActor ((any Error)?) -> Void) {}
    func readBack(_ doc: EventDoc, completion: @escaping @MainActor (ServerCopy) -> Void) { completion(.unknownOffline) }
    func listen(incidentId: String, onSnapshot: @escaping @MainActor ([ServerEventCopy]) -> Void) -> AnyObject? { nil }
}
