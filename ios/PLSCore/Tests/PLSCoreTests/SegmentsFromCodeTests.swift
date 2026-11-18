import Foundation
import Testing
@testable import PLSCore

/// Review ruling 2026-11-18 (spike S1): a reading's segment ids come from code, never the
/// model. The ids the report text names; else the segment under the GPS fix; the model's
/// segment field is ignored. The kind comes from the model, with the parser's as fallback.
@Suite struct SegmentsFromCodeTests {
    let known = ["AA", "AB", "AC", "AD"]

    @Test func theChoiceIsNamedIdsThenTheGPSSegment() {
        #expect(SegmentChoice.ids(rawText: "cleared segment AB", known: known, positionSegmentId: "AD") == ["AB"])
        #expect(SegmentChoice.ids(rawText: "we cleared our area", known: known, positionSegmentId: "AD") == ["AD"])
        #expect(SegmentChoice.ids(rawText: "we cleared our area", known: known, positionSegmentId: nil) == [])
        #expect(SegmentChoice.ids(rawText: "cleared segment ZZ", known: known, positionSegmentId: "AD") == ["ZZ"])   // rejected later
    }

    func ctx(position: String?) -> ReadContext {
        var c = ReadContext(incidentMode: "drill", knownSegmentIds: known, networkOnline: false,
                            onDevice: OnDeviceStatus(available: true, localeSupported: true, contextSize: 4096, variant: "AFM"),
                            estimatedTokens: 400, tokenBudgetFraction: 0.5, cloudConsent: false, killCloud: false,
                            cloudModel: "m", screen: EvidenceScreen(terms: ["blood"]))
        c.positionSegmentId = position
        return c
    }

    @Test func aReportNamingABWhileAssignedACYieldsAB() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "cleared segment AB"))]
        let o = await ReadOrchestrator.read(text: "Team two cleared segment AB, coverage point eight", context: ctx(position: "AC"),
                                            runner: r, clock: FixedClock(ms: [0, 10]))
        #expect(o.route.stage == .guided)
        #expect(o.reading.segmentIds == ["AB"])
        #expect(o.reading.kind == .cleared)
    }

    @Test func aReportNamingNothingYieldsTheGPSSegment() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "we cleared our area"))]
        let o = await ReadOrchestrator.read(text: "we cleared our area, coverage point eight", context: ctx(position: "AD"),
                                            runner: r, clock: FixedClock(ms: [0, 10]))
        #expect(o.route.stage == .guided)
        #expect(o.reading.segmentIds == ["AD"])
    }

    @Test func aModelKindOutsideTheListFallsBackToTheParser() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.refusal)]
        r.permissiveResults = [.success("maybe|AB|0.8")]
        let text = "Team two cleared segment AB, coverage point eight"
        let o = await ReadOrchestrator.read(text: text, context: ctx(position: nil), runner: r, clock: FixedClock(ms: [0, 10]))
        #expect(o.route.stage == .deterministicParser)
        #expect(o.reading.kind == ReportParser.parse(text, context: ParseContext(knownSegmentIds: known)).kind)
        #expect(o.reading.segmentIds == ["AB"])
    }

    @Test func theStoredEventUsesTheCodeChoiceNotTheModels() {
        let o = ReadOutcome(reading: reading(segmentIds: ["AC"], coverage: 1, evidenceQuote: "we cleared our area"), route:
            RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "m", reason: .noNetwork, latencyMs: 1, sdkReported: false, blocked: nil, decidedAtMs: 1),
            validation: .ok)
        let here = inside("AD")
        let c = OutcomeContext(incidentId: "I1", teamId: "T1", deviceId: "D1", authorUid: "u1", priorVersion: 1, clientTimeMs: 1, inputMethod: .typed,
                               isTrainingInject: false, grid: grid,
                               effect: EffectContext(grid: grid, assignedSegmentIds: ["AC"], position: nil, visualDetectionRangeM: 10, rdBasis: .openTarget),
                               params: params)
        let e = ReadOutcomeBuilder.event(from: o, rawText: "we cleared our area", position: Position(lat: here.lat, lon: here.lon, accuracyM: 5),
                                         context: c, seq: 1)
        #expect(e.reading?["segmentIds"] == .array([.string("AD")]))
        #expect(e.effect.clearedSegmentId == "AD")
    }
}
