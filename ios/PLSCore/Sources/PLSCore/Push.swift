import Foundation

/// The team's push topic: command's new-assignment push goes to `pls-{incidentId}-{teamId}`.
public enum PushTopic {
    static func isId(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil }

    /// Nil unless both ids are ones Firestore and FCM topics both accept.
    public static func name(incidentId: String, teamId: String) -> String? {
        guard isId(incidentId), isId(teamId) else { return nil }
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
              PushTopic.isId(incident), PushTopic.isId(team) else { return nil }
        let version: Int? = {
            if let s = userInfo["planVersion"] as? String { return Int(s) }
            if let n = userInfo["planVersion"] as? Int { return n }
            return nil
        }()
        guard let version, version >= 0 else { return nil }
        self.init(incidentId: incident, teamId: team, planVersion: version)
    }
}
