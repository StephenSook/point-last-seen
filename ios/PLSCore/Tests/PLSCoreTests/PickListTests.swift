import Foundation
import Testing
@testable import PLSCore

/// The pick-list: when the phone cannot read a report (or the searcher prefers), the person picks
/// the kind, the segment and, for a clear, how long and how many searched. No model runs.
@Suite struct PickListTests {
    @Test func aPickBecomesAReadingWithAPicklistRoute() {
        let o = PickList.outcome(PickListChoice(kind: .cleared, segmentId: "AB", minutes: 30, searchers: 3), nowMs: 1_000)
        #expect(o.route.stage == .picklist && o.route.path == .rules && o.route.model == "none" && o.route.reason == .onDeviceDefault)
        #expect(o.route.latencyMs == 0 && o.route.decidedAtMs == 1_000 && o.route.sdkReported == false)
        #expect(o.reading.kind == .cleared && o.reading.segmentIds == ["AB"])
        #expect(o.reading.minutes == 30 && o.reading.searchers == 3 && o.reading.coverage == nil)
        #expect(o.reading.evidenceQuote == "")
        #expect(o.validation.isOK)
    }

    @Test func theStoredEventKeepsThePickedSegmentNotTheGPSOne() {
        let o = PickList.outcome(PickListChoice(kind: .cleared, segmentId: "AB", minutes: 30, searchers: 3), nowMs: 1_000)
        let c = OutcomeContext(incidentId: "I1", teamId: "T1", deviceId: "D1", authorUid: "D1", priorVersion: 1, clientTimeMs: 1_000,
                               inputMethod: .picklist, isTrainingInject: false, grid: grid,
                               effect: EffectContext(grid: grid, assignedSegmentIds: ["AC"], position: nil, visualDetectionRangeM: 10,
                                                     rdBasis: .openTarget),
                               params: params)
        let e = ReadOutcomeBuilder.event(from: o, rawText: "", position: inside("AD"), context: c, seq: 1)
        #expect(e.reading?["segmentIds"] == .array([.string("AB")]))
        #expect(e.effect.clearedSegmentId == "AB")
        #expect(e.inputMethod == .picklist && e.route?.stage == .picklist)
    }

    @Test func aClueWithNoSegmentUsesThePositionLikeAnyClue() {
        let o = PickList.outcome(PickListChoice(kind: .clue, segmentId: nil, minutes: nil, searchers: nil), nowMs: 1)
        #expect(o.reading.kind == .clue && o.reading.segmentIds.isEmpty)
    }
}
