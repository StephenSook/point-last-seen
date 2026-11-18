import FirebaseAILogic
import Foundation
import FoundationModels
import PLSCore

/// What the phone knows about the team and the drill when a report arrives.
struct ReportSituation {
    var incidentMode: String?
    var knownSegmentIds: [String]
    var assignedSegmentIds: [String]
    var positionSegmentId: String?
    var profile: ModelProfile
    var networkOnline: Bool
    var cloudConsent: Bool
    /// Connectivity, consent, kill switch and incident mode as they are now; read again by
    /// PLSCore at the moment of any cloud dispatch. Nil means the values above are used.
    var liveGate: (@Sendable () -> LiveGate)? = nil
}

/// Reads one field report and never throws. The decisions live in PLSCore's ReadOrchestrator;
/// this type supplies the real models, the tools and the Remote Config values.
struct ReportReader {
    let ai: FirebaseAI
    let config: RemoteConfigValues
    let screen: EvidenceScreen
    /// Counts tokens with Apple's model (a seam for tests).
    var estimateTokens: @Sendable (String, [any Tool]) async -> Int = { await ModelSessionFactory.estimateTokens(report: $0, tools: $1) }

    func read(_ text: String, situation: ReportSituation) async -> ReadOutcome {
        // The evidence screen and the drill check come before any call that hands the text to a
        // model API, the token count included; then no count is needed at all.
        let modelAllowed = !screen.isPossibleEvidence(text) && situation.incidentMode.map(ReadPlan.modelModes.contains) == true
        let tools: [any Tool] = [SegmentAtTool(positionSegmentId: situation.positionSegmentId),
                                 TeamAssignmentTool(assignedSegmentIds: situation.assignedSegmentIds),
                                 SubjectProfileTool(profile: situation.profile)]
        let context = ReadContext(
            incidentMode: situation.incidentMode, knownSegmentIds: situation.knownSegmentIds,
            networkOnline: situation.networkOnline, onDevice: ModelSessionFactory.onDeviceStatus(),
            estimatedTokens: modelAllowed ? await estimateTokens(text, tools) : 0,
            tokenBudgetFraction: config.tokenBudgetFraction, cloudConsent: situation.cloudConsent,
            killCloud: config.killCloud, cloudModel: config.cloudModelIOS, screen: screen, liveGate: situation.liveGate)
        let runner = FoundationModelRunner(ai: ai, cloudModel: config.cloudModelIOS, tools: tools)
        return await ReadOrchestrator.read(text: text, context: context, runner: runner, clock: SystemClock())
    }
}
