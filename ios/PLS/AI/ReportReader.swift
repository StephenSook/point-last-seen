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
}

/// Reads one field report and never throws. The decisions live in PLSCore's ReadOrchestrator;
/// this type supplies the real models, the tools and the Remote Config values.
struct ReportReader {
    let ai: FirebaseAI
    let config: RemoteConfigValues
    let screen: EvidenceScreen

    func read(_ text: String, situation: ReportSituation) async -> ReadOutcome {
        let tools: [any Tool] = [SegmentAtTool(positionSegmentId: situation.positionSegmentId),
                                 TeamAssignmentTool(assignedSegmentIds: situation.assignedSegmentIds),
                                 SubjectProfileTool(profile: situation.profile)]
        let context = ReadContext(
            incidentMode: situation.incidentMode, knownSegmentIds: situation.knownSegmentIds,
            networkOnline: situation.networkOnline, onDevice: ModelSessionFactory.onDeviceStatus(),
            estimatedTokens: await ModelSessionFactory.estimateTokens(report: text, tools: tools),
            tokenBudgetFraction: config.tokenBudgetFraction, cloudConsent: situation.cloudConsent,
            killCloud: config.killCloud, cloudModel: config.cloudModelIOS, screen: screen)
        let runner = FoundationModelRunner(ai: ai, cloudModel: config.cloudModelIOS, tools: tools)
        return await ReadOrchestrator.read(text: text, context: context, runner: runner, clock: SystemClock())
    }
}
