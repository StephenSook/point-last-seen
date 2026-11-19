import Foundation

/// Join codes as the joinIncident callable reads them (functions/src/join.ts): case, spaces and
/// hyphens are ignored, and a code is 8 symbols of the Crockford base-32 alphabet (no I, L, O, U).
public enum JoinCode {
    public static func normalize(_ code: String) -> String {
        String(code.uppercased().unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) && $0 != "-" })
    }

    public static func isWellFormed(_ code: String) -> Bool {
        normalize(code).range(of: "^[0-9A-HJKMNP-TV-Z]{8}$", options: .regularExpression) != nil
    }
}

/// A searcher's join request: the code, the team command named, and the incident when known. It
/// is checked here first, so a request that cannot work never spends one of the hour's attempts.
public struct SearcherJoin: Equatable, Sendable {
    public enum InputError: Error, Equatable {
        case code, team, incident

        public var message: String {
            switch self {
            case .code: "The join code has 8 letters and numbers."
            case .team: "Type the team command gave you, for example T1."
            case .incident: "The incident id has only letters, numbers, - and _."
            }
        }
    }

    public let joinCode: String
    public let teamId: String
    public let incidentId: String?

    static func isId(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil }

    public static func make(code: String, teamId: String, incidentId: String) throws -> SearcherJoin {
        guard JoinCode.isWellFormed(code) else { throw InputError.code }
        let team = teamId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isId(team) else { throw InputError.team }
        let incident = incidentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard incident.isEmpty || isId(incident) else { throw InputError.incident }
        return SearcherJoin(joinCode: JoinCode.normalize(code), teamId: team, incidentId: incident.isEmpty ? nil : incident)
    }

    /// The callable's request: role is always searcher on this app.
    public var payload: [String: String] {
        var p = ["joinCode": joinCode, "role": "searcher", "teamId": teamId]
        if let incidentId { p["incidentId"] = incidentId }
        return p
    }
}
