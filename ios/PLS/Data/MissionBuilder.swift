import Foundation
import PLSCore

/// The member-readable documents a searcher's phone builds its mission from.
struct MissionDocs: Sendable {
    /// `incidents/{incidentId}`.
    var incident: JSONValue
    /// `incidents/{incidentId}/segments/*`, ROW included.
    var segments: [JSONValue]
    /// The latest approved `plans/{version}`; nil before command approves one.
    var plan: JSONValue? = nil
    /// `profile/shared`; nil until command or the family shares it.
    var sharedProfile: JSONValue? = nil
}

/// Builds the phone's mission from those documents, with the same parsers the pack uses. What it
/// cannot trust it refuses, in words the ready check shows.
enum MissionBuilder {
    enum Failure: Error, Equatable {
        case notOpen
        case segments(String)
        case priorMismatch

        var message: String {
            switch self {
            case .notOpen: "This incident is not open for searching."
            case let .segments(id): "The search area could not be read (segment \(id)). Ask command to rebuild it."
            case .priorMismatch: "Command is rebuilding the search area. Try again in a minute."
            }
        }
    }

    static func build(incidentId: String, teamId: String, docs: MissionDocs, bundledParams: EngineParams) throws -> Mission {
        guard case .string("open")? = docs.incident["status"] else { throw Failure.notOpen }
        let parsed: PackSegments.Parsed
        do {
            parsed = try PackSegments.parse(docs.segments)
        } catch let PackSegments.PackError.badSegment(id) {
            throw Failure.segments(id)
        } catch {
            throw Failure.segments("ROW")
        }
        // The segments and the incident must describe the same prior.
        if case let .number(v)? = docs.incident["priorVersion"], Int(exactly: v) != parsed.priorVersion { throw Failure.priorMismatch }
        let params = (try? docs.incident["engineParams"]?.decode(EngineParams.self)) ?? bundledParams
        let plan = try? docs.plan?.decode(PlanDoc.self)
        let assignment = plan?.assignment(for: teamId)
        let shared = docs.sharedProfile
        // The mode as command wrote it; missing or not text reads as "", which no model mode matches,
        // so only an incident marked exactly "drill" or "judge" can reach a model.
        let mode: String = { if case let .string(m)? = docs.incident["mode"] { m } else { "" } }()
        let priorInputs: [String] = {
            guard case let .array(ids)? = docs.incident["priorInputEventIds"] else { return [] }
            return ids.compactMap { if case let .string(s) = $0 { s } else { nil } }
        }()
        return Mission(incidentId: incidentId, mode: mode, teamId: teamId, priorVersion: parsed.priorVersion, grid: parsed.grid,
                       prior: parsed.prior, assignedSegmentIds: assignment?.segmentIds ?? [], params: params,
                       profile: ModelProfile(shared: shared ?? .null), sharedProfile: try? shared?.decode(SharedProfile.self),
                       visualDetectionRangeM: nil, rdBasis: .default, assignment: assignment, planVersion: plan?.version,
                       priorInputEventIds: priorInputs,
                       conditions: IncidentConditions(incidentField: docs.incident["conditions"]))
    }
}
