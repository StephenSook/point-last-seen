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
    /// The release route check only: Apple's model counts as unavailable for this one read, so the
    /// router takes the cloud route. Never set for a searcher's report.
    var onDeviceOff = false
    /// The subject's names, for the found-kind rule only (never sent to a model).
    var subjectNames: [String] = []
    /// Whether the mission the report was made for is still on screen; checked before every model call, the token
    /// count included. Nil: not checked.
    var stillCurrent: (@Sendable () -> Bool)? = nil
}

/// Reads one field report and never throws. The decisions live in PLSCore's ReadOrchestrator;
/// this type supplies the real models, the tools and the Remote Config values.
struct ReportReader {
    let ai: FirebaseAI
    let config: RemoteConfigValues
    let screen: EvidenceScreen
    /// The language screen before any cloud read, from the bundled word lists. If they cannot be read
    /// it is nil, and no note goes to the cloud.
    var language: LanguageScreen? = try? BundledConstants.languageScreen()
    /// The grounding rule run on every reading; when it cannot be loaded the fields it checks are blanked.
    var grounding: Grounding? = try? BundledConstants.grounding()
    /// The found-kind rule (built on the same word lists); when it cannot be loaded the model's kind stays.
    var foundKind: FoundKind? = (try? BundledConstants.grounding()).map(FoundKind.init)
    /// Whether this phone has the cloud route (iOS 27); without it a read never goes to the cloud (a seam for tests).
    var cloudRouteAvailable: Bool = ModelSessionFactory.cloudRouteSupported
    /// Counts tokens with Apple's model (a seam for tests).
    var estimateTokens: @Sendable (String, [any Tool]) async -> Int = { await ModelSessionFactory.estimateTokens(report: $0, tools: $1) }
    /// The count is a call into Apple's model and can stall like any model call (spike S1 on the
    /// Mac saw a FoundationModels call stall for 44 minutes), so it gets its own limit.
    var tokenCountTimeoutSeconds: Double = 5
    /// Builds the model runner (a seam for tests).
    var makeRunner: @Sendable (FirebaseAI, String, [any Tool]) -> any ReadModelRunner = {
        FoundationModelRunner(ai: $0, cloudModel: $1, tools: $2)
    }
    /// Records the route of every read, on every path (P-15; a seam for tests).
    var recordRoute: @Sendable (RouteRecord) -> Void = { PerformanceTelemetry.record($0) }
    /// Apple's model as this phone reports it (a seam for tests).
    var deviceStatus: @Sendable () -> OnDeviceStatus = { ModelSessionFactory.onDeviceStatus() }

    /// The three read-only tools for one read. The cloud gets all three; Apple's model gets none, and its
    /// instructions are built from the first two.
    static func tools(for situation: ReportSituation) -> [any Tool] {
        [SegmentAtTool(positionSegmentId: situation.positionSegmentId),
         TeamAssignmentTool(assignedSegmentIds: situation.assignedSegmentIds),
         SubjectProfileTool(profile: situation.profile)]
    }

    func read(_ text: String, situation: ReportSituation) async -> ReadOutcome {
        // The evidence screen and the drill check come before any call that hands the text to a
        // model API, the token count included; then no count is needed at all.
        let modelAllowed = !screen.isPossibleEvidence(text) && situation.incidentMode.map(ReadPlan.modelModes.contains) == true
            && situation.stillCurrent?() != false
        let tools = Self.tools(for: situation)
        var context = ReadContext(
            incidentMode: situation.incidentMode, knownSegmentIds: situation.knownSegmentIds,
            networkOnline: situation.networkOnline,
            onDevice: situation.onDeviceOff
                ? OnDeviceStatus(available: false, localeSupported: false, contextSize: 0, variant: "off for the route check")
                : deviceStatus(),
            // The count is a call into Apple's model too, so it gets the text without phone numbers.
            estimatedTokens: modelAllowed ? await countTokens(PhoneNumbers.scrub(text), tools) : 0,
            tokenBudgetFraction: config.tokenBudgetFraction, cloudConsent: situation.cloudConsent,
            // Without the cloud route (iOS 26) the cloud is off, as with the kill switch: Apple's model, then rules.
            killCloud: config.killCloud || !cloudRouteAvailable, cloudModel: config.cloudModelIOS, screen: screen, liveGate: situation.liveGate)
        context.positionSegmentId = situation.positionSegmentId          // segment ids come from code, not the model
        context.language = language
        context.grounding = grounding
        context.foundKind = foundKind
        context.subjectNames = situation.subjectNames
        context.stillCurrent = situation.stillCurrent
        context.profile = situation.profile
        let runner = makeRunner(ai, config.cloudModelIOS, tools)
        let outcome = await ReadOrchestrator.read(text: text, context: context, runner: runner, clock: SystemClock())
        recordRoute(outcome.route)
        return outcome
    }

    /// The token count with its time limit; on timeout, a characters-per-token estimate.
    private func countTokens(_ text: String, _ tools: [any Tool]) async -> Int {
        let estimate = estimateTokens
        return await Timeout.run(seconds: tokenCountTimeoutSeconds) { await estimate(text, tools) } ?? 1200 + text.count / 3
    }
}
