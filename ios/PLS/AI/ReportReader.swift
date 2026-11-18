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
    /// The count is a call into Apple's model and can stall like any model call (spike S1 on the
    /// Mac saw a FoundationModels call stall for 44 minutes), so it gets its own limit.
    var tokenCountTimeoutSeconds: Double = 5
    /// Builds the model runner (a seam for tests).
    var makeRunner: @Sendable (FirebaseAI, String, [any Tool]) -> any ReadModelRunner = {
        FoundationModelRunner(ai: $0, cloudModel: $1, tools: $2)
    }

    func read(_ text: String, situation: ReportSituation) async -> ReadOutcome {
        // The evidence screen and the drill check come before any call that hands the text to a
        // model API, the token count included; then no count is needed at all.
        let modelAllowed = !screen.isPossibleEvidence(text) && situation.incidentMode.map(ReadPlan.modelModes.contains) == true
        let tools: [any Tool] = [SegmentAtTool(positionSegmentId: situation.positionSegmentId),
                                 TeamAssignmentTool(assignedSegmentIds: situation.assignedSegmentIds),
                                 SubjectProfileTool(profile: situation.profile)]
        var context = ReadContext(
            incidentMode: situation.incidentMode, knownSegmentIds: situation.knownSegmentIds,
            networkOnline: situation.networkOnline, onDevice: ModelSessionFactory.onDeviceStatus(),
            estimatedTokens: modelAllowed ? await countTokens(text, tools) : 0,
            tokenBudgetFraction: config.tokenBudgetFraction, cloudConsent: situation.cloudConsent,
            killCloud: config.killCloud, cloudModel: config.cloudModelIOS, screen: screen, liveGate: situation.liveGate)
        context.positionSegmentId = situation.positionSegmentId          // segment ids come from code, not the model
        let runner = makeRunner(ai, config.cloudModelIOS, tools)
        return await ReadOrchestrator.read(text: text, context: context, runner: runner, clock: SystemClock())
    }

    /// The token count with its time limit; on timeout, a characters-per-token estimate.
    private func countTokens(_ text: String, _ tools: [any Tool]) async -> Int {
        let estimate = estimateTokens
        return await Timeout.run(seconds: tokenCountTimeoutSeconds) { await estimate(text, tools) } ?? 1200 + text.count / 3
    }
}
