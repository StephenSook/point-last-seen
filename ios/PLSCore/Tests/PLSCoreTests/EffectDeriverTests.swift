import Foundation
import Testing
@testable import PLSCore

@Suite struct EffectDeriverTests {
    @Test func effectUsesAssignedSegmentWhenPositionIsNil() {
        let e = EffectDeriver.cleared(reading: reading(segmentIds: [], coverage: 1.0), context: ctx(position: nil, assigned: ["AC"]), params: params)
        #expect(e.clearedSegmentId == "AC")
        #expect(e.pod == 0.6321205588285577)
    }

    @Test func firstKnownSegmentIdWinsOverAssignment() {
        let e = EffectDeriver.cleared(reading: reading(segmentIds: ["ZZ", "AB"], coverage: 0.5), context: ctx(assigned: ["AC"]), params: params)
        #expect(e.clearedSegmentId == "AB")
    }

    @Test func soundOnlyClearIsNotCounted() {
        #expect(EffectDeriver.cleared(reading: reading(method: .sound, coverage: 1), context: ctx(), params: params) == .none(why: .soundOnly))
    }

    @Test func soundCountsWhenTheProfileSaysSo() {
        var p = params
        p.detectionProfile = DetectionProfile(soundCounts: true)
        #expect(EffectDeriver.cleared(reading: reading(method: .sound, coverage: 1), context: ctx(), params: p).clearedSegmentId == "AC")
    }

    @Test func statedPercentIsNormalized() {
        let e = EffectDeriver.cleared(reading: reading(coverage: 80), context: ctx(), params: params)
        #expect(e == .cleared(segmentId: "AC", pod: 1 - exp(-0.8),
                              inputs: ClearedInputs(coverage: 0.8, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget)))
    }

    @Test func invalidCoverageGivesInvalid() {
        #expect(EffectDeriver.cleared(reading: reading(coverage: 400), context: ctx(), params: params) == .none(why: .invalid))
    }

    @Test func coverageIsComputedFromMinutesSearchersAndMeasuredRange() {
        let e = EffectDeriver.cleared(reading: reading(minutes: 45, searchers: 3), context: ctx(rangeM: 10), params: params)
        guard case let .cleared(_, pod, inputs) = e else { Issue.record("not cleared: \(e)"); return }
        #expect(near(inputs.sweepWidthM, 16.45))
        #expect(near(inputs.trackLengthM, 3159))
        #expect(near(inputs.coverage, 16.45 * 3159 / 15_625))
        #expect(near(pod, 1 - exp(-16.45 * 3159 / 15_625)))
    }

    @Test func missingInputsNeedCommand() {
        #expect(EffectDeriver.cleared(reading: reading(minutes: 45, searchers: nil), context: ctx(), params: params) == .none(why: .needsCommand))
        #expect(EffectDeriver.cleared(reading: reading(minutes: 45, searchers: 3), context: ctx(rangeM: nil), params: params) == .none(why: .needsCommand))
        #expect(EffectDeriver.cleared(reading: reading(segmentIds: [], coverage: 1), context: ctx(assigned: []), params: params) == .none(why: .needsCommand))
    }

    @Test func aRangeStatedInTheReportWinsAndIsMarkedStated() {
        let e = EffectDeriver.cleared(reading: reading(minutes: 10, searchers: 1, detectionRangeM: 20), context: ctx(rangeM: 10), params: params)
        guard case let .cleared(_, _, inputs) = e else { Issue.record("not cleared"); return }
        #expect(near(inputs.sweepWidthM, 1.645 * 20))
        #expect(inputs.rdBasis == .stated)
    }

    @Test func clearedFunctionRefusesOtherKindsAndClueRefusesClears() {
        #expect(EffectDeriver.cleared(reading: reading(kind: .clue, coverage: 1), context: ctx(), params: params) == .none(why: .invalid))
        #expect(EffectDeriver.clue(reading: reading(kind: .cleared), context: ctx(position: inside("AA"))) == .none(why: .invalid))
    }

    @Test func clueAtAPositionIsStrongForItsCellAndForTheNeighbourItPointsAt() {
        let e = EffectDeriver.clue(reading: reading(kind: .clue, direction: .e, matchesProfile: .consistent), context: ctx(position: inside("AA")))
        #expect(e == .clue(influences: ["AA": .strongFor, "AB": .for], authenticity: .high))
    }

    @Test func diagonalDirectionReachesBothEdgeNeighbours() {
        // From AD (bottom right), "nw" points at AB (north) and AC (west), each 45 degrees off.
        let e = EffectDeriver.clue(reading: reading(kind: .clue, direction: .nw), context: ctx(position: inside("AD")))
        #expect(e == .clue(influences: ["AD": .strongFor, "AB": .for, "AC": .for], authenticity: .medium))
    }

    @Test func upstreamAndDownstreamFollowTheStreamLists() {
        let down = EffectDeriver.clue(reading: reading(kind: .clue, direction: .downstream), context: ctx(position: inside("AA")))
        #expect(down == .clue(influences: ["AA": .strongFor, "AC": .for], authenticity: .medium))
        let up = EffectDeriver.clue(reading: reading(kind: .clue, direction: .upstream, matchesProfile: .inconsistent), context: ctx(position: inside("AC")))
        #expect(up == .clue(influences: ["AC": .strongFor, "AA": .for], authenticity: .low))
    }

    @Test func clueOutsideTheGridIsOutsideArea() {
        let e = EffectDeriver.clue(reading: reading(kind: .clue), context: ctx(position: Position(lat: 5, lon: 5, accuracyM: 5)))
        #expect(e == .none(why: .outsideArea))
    }

    @Test func clueWithoutAFixUsesTheReadingThenTheAssignment() {
        #expect(EffectDeriver.clue(reading: reading(kind: .clue, segmentIds: ["AB"]), context: ctx(position: nil)) == .clue(influences: ["AB": .strongFor], authenticity: .medium))
        #expect(EffectDeriver.clue(reading: reading(kind: .clue, segmentIds: []), context: ctx(position: nil, assigned: ["AD"])) == .clue(influences: ["AD": .strongFor], authenticity: .medium))
        #expect(EffectDeriver.clue(reading: reading(kind: .clue, segmentIds: []), context: ctx(position: nil, assigned: [])) == .none(why: .needsCommand))
    }
}
