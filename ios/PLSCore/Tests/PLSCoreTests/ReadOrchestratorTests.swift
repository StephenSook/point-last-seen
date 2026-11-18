import Foundation
import Testing
@testable import PLSCore

/// A runner that replays scripted results and records every call, so the tests can prove
/// which model was asked, in which order.
final class FakeRunner: ReadModelRunner, @unchecked Sendable {
    enum Call: Equatable { case guided(RoutePath), permissive }
    var guidedResults: [RoutePath: [Result<ReportReading, ReadFailure>]] = [:]
    var permissiveResults: [Result<String, ReadFailure>] = []
    private(set) var calls: [Call] = []

    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        calls.append(.guided(path))
        guard var list = guidedResults[path], !list.isEmpty else { return .failure(.other) }
        let r = list.removeFirst(); guidedResults[path] = list; return r
    }

    func permissive(_ text: String) async -> Result<String, ReadFailure> {
        calls.append(.permissive)
        guard !permissiveResults.isEmpty else { return .failure(.other) }
        return permissiveResults.removeFirst()
    }
}

private let report = "Team two cleared segment AC, coverage point eight, nothing found"
private func okReading(_ ids: [String] = ["AC"]) -> ReportReading {
    reading(segmentIds: ids, coverage: 0.8, evidenceQuote: "cleared segment AC")
}
private func rctx(online: Bool = true, onDevice: Bool = true, consent: Bool = true, kill: Bool = false, mode: String? = "drill") -> ReadContext {
    ReadContext(incidentMode: mode, knownSegmentIds: ["AA", "AB", "AC", "AD"], networkOnline: online,
                onDevice: OnDeviceStatus(available: onDevice, localeSupported: true, contextSize: 4096, variant: "AFM 3 Core Advanced"),
                estimatedTokens: 400, tokenBudgetFraction: 0.5, cloudConsent: consent, killCloud: kill,
                cloudModel: "gemini-3.5-flash-lite", screen: EvidenceScreen(terms: ["blood"]))
}
private var clock: FixedClock { FixedClock(ms: [1_000, 1_850]) }      // one per test: tests run in parallel

@Suite struct ReadOrchestratorTests {
    @Test func onDeviceGuidedReadingIsUsedWhenValid() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(o.route.path == .onDevice)
        #expect(o.route.stage == .guided)
        #expect(o.route.reason == .noNetwork)
        #expect(o.route.model == "AFM 3 Core Advanced")
        #expect(o.route.sdkReported == false)
        #expect(o.route.latencyMs == 850)
        #expect(r.calls == [.guided(.onDevice)])
    }

    @Test func aBlockedReportStaysOnDeviceAndNeverReachesTheCloud() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        r.permissiveResults = [.failure(.guardrailBlock)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .permissive])
        #expect(o.route.stage == .deterministicParser)
        #expect(o.route.blocked == .guardrail)
        #expect(o.reading.coverage == 0.8)                 // the parser read it
    }

    @Test func permissiveLineFillsKindSegmentsAndCoverage() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.refusal)]
        r.permissiveResults = [.success("KIND: cleared, SEGMENTS: AC, COVERAGE: 0.6")]
        let o = await ReadOrchestrator.read(text: "we cleared AC, about sixty percent", context: rctx(), runner: r, clock: clock)
        #expect(o.route.stage == .permissiveText)
        #expect(o.route.blocked == .refusal)
        #expect(o.reading.kind == .cleared)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(o.reading.coverage == 0.6)
    }

    @Test func anInvalidModelReadingFallsToTheParser() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading(["ZZ"]))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(o.route.stage == .deterministicParser)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(r.calls == [.guided(.onDevice)])
    }

    @Test func aModelThatIsNotReadyReroutesToTheCloudWhenAllowed() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.unavailable)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .guided(.cloud)])
        #expect(o.route.path == .cloud)
        #expect(o.route.reason == .onDeviceUnavailable)
        #expect(o.route.model == "gemini-3.5-flash-lite")
    }

    @Test func noConsentMeansRulesNotCloud() async {
        let r = FakeRunner()
        let o = await ReadOrchestrator.read(text: report, context: rctx(onDevice: false, consent: false), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.path == .rules)
        #expect(o.route.stage == .deterministicParser)
    }

    @Test func evidenceTextCallsNoModelAtAll() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: "there is blood on a rock in AC", context: rctx(), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.stage == .evidenceProtocol)
        #expect(o.route.reason == .possibleEvidence)
        #expect(o.route.model == "none")
    }

    @Test func outsideADrillNoModelIsCalled() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(mode: "live"), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.reason == .notDrillMode)
    }

    @Test func anUnreadableReportEndsAtThePickList() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]; r.permissiveResults = [.success("no idea")]
        let o = await ReadOrchestrator.read(text: "hmm", context: rctx(), runner: r, clock: clock)
        #expect(o.reading.kind == .unclear)
        #expect(o.route.stage == .deterministicParser)
        #expect(o.needsPickList)
    }
}

@Suite struct PermissiveLineTests {
    @Test func pipeAndLabelledFormsBothParse() {
        #expect(PermissiveLine.parse("cleared|AC|0.8", known: ["AC"]) == PermissiveLine(kind: .cleared, segmentIds: ["AC"], coverage: 0.8))
        #expect(PermissiveLine.parse("KIND: found, SEGMENTS: AB, COVERAGE: none", known: ["AB"]) == PermissiveLine(kind: .found, segmentIds: ["AB"], coverage: nil))
    }

    @Test func unknownKindsAndIdsAreRefused() {
        #expect(PermissiveLine.parse("KIND: teleported, SEGMENTS: AB", known: ["AB"]) == nil)
        #expect(PermissiveLine.parse("KIND: clue, SEGMENTS: subject injured by the creek in ZZ, COVERAGE: creek", known: ["AB"]) == PermissiveLine(kind: .clue, segmentIds: [], coverage: nil))
    }
}
