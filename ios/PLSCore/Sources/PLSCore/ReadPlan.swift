import Foundation

/// Which stages a report goes through, decided before any model is touched.
public struct ReadPlan: Sendable, Equatable {
    public var stages: [ReadStage]
    public var callsModel: Bool
    public var decision: RouteDecision

    /// Incident modes in which the Apple-model and Gemini paths may run (a labelled drill or a
    /// judge sandbox). Anything else reads by rules only.
    public static let modelModes: Set<String> = ["drill", "judge"]

    public static func make(text: String, decision: RouteDecision, screen: EvidenceScreen, incidentMode: String?) -> ReadPlan {
        if screen.isPossibleEvidence(text) {
            return ReadPlan(stages: [.evidenceProtocol], callsModel: false, decision: RouteDecision(path: .rules, reason: .possibleEvidence))
        }
        guard let mode = incidentMode, modelModes.contains(mode) else {
            return ReadPlan(stages: [.deterministicParser], callsModel: false, decision: RouteDecision(path: .rules, reason: .notDrillMode))
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.count > ReportParser.maxLength {
            return ReadPlan(stages: [.deterministicParser], callsModel: false, decision: RouteDecision(path: .rules, reason: decision.reason))
        }
        switch decision.path {
        case .onDevice:
            return ReadPlan(stages: [.guided, .permissiveText, .deterministicParser], callsModel: true, decision: decision)
        case .cloud:
            return ReadPlan(stages: [.guided, .deterministicParser], callsModel: true, decision: decision)
        case .rules:
            return ReadPlan(stages: [.deterministicParser], callsModel: false, decision: decision)
        }
    }
}
