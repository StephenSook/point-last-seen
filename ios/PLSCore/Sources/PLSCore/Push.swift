import Foundation

/// A team id as the server accepts it (functions join.ts and notify.ts): letters, digits and _ only,
/// at most 32, and never "family" (the family's topic ends in "-family").
public enum TeamId {
    public static func isValid(_ s: String) -> Bool {
        s.range(of: "^[A-Za-z0-9_]{1,32}$", options: .regularExpression) != nil && s.lowercased() != "family"
    }
}

/// The team's push topic: command's new-assignment push goes to `pls-{incidentId}-{teamId}`.
public enum PushTopic {
    static func isIncidentId(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil }

    /// Nil unless both ids are the server's. A team id has no "-", so the last "-" separates the two
    /// and no other incident and team can name the same topic.
    public static func name(incidentId: String, teamId: String) -> String? {
        guard isIncidentId(incidentId), TeamId.isValid(teamId) else { return nil }
        return "pls-\(incidentId)-\(teamId)"
    }
}

/// What a new-assignment push carries: ids only. The words a person reads come from the plan the
/// phone loads, never from the push.
public struct PushPayload: Equatable, Sendable {
    public let incidentId: String
    public let teamId: String
    public let planVersion: Int

    public init(incidentId: String, teamId: String, planVersion: Int) {
        self.incidentId = incidentId
        self.teamId = teamId
        self.planVersion = planVersion
    }

    /// Reads the ids from a notification's userInfo (FCM sends data values as text); nil when any is missing or malformed.
    public init?(userInfo: [AnyHashable: Any]) {
        guard let incident = userInfo["incidentId"] as? String, let team = userInfo["teamId"] as? String,
              PushTopic.isIncidentId(incident), TeamId.isValid(team) else { return nil }
        let version: Int? = {
            if let s = userInfo["planVersion"] as? String { return Int(s) }
            if let n = userInfo["planVersion"] as? Int { return n }
            return nil
        }()
        guard let version, version >= 0 else { return nil }
        self.init(incidentId: incident, teamId: team, planVersion: version)
    }
}
