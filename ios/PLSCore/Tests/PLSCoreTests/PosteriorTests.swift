import Testing
@testable import PLSCore

private func cleared(_ id: String, _ seg: String, pod: Double) -> EngineEvent {
    EngineEvent(eventId: id, effect: .cleared(segmentId: seg, pod: pod, inputs: ClearedInputs(coverage: 0, sweepWidthM: nil, trackLengthM: nil, areaM2: 1, rdBasis: .default)))
}

@Suite struct PosteriorTests {
    let prior = [SegmentPrior(segmentId: "A", priorPoa: 0.5), SegmentPrior(segmentId: "B", priorPoa: 0.3), SegmentPrior(segmentId: "ROW", priorPoa: 0.2)]

    @Test func bayesClearedHalf() {
        let r = Posterior.compute(prior: prior, events: [cleared("e1", "A", pod: 0.5)], params: params)
        #expect(near(r.poa["A"], 1.0 / 3))
        #expect(near(r.poa["B"], 0.4))
        #expect(near(r.poa["ROW"], 4.0 / 15))
        #expect(r.appliedEventIds == ["e1"])
    }

    @Test func frostRemainingMass() {
        let p = [SegmentPrior(segmentId: "A", priorPoa: 0.3), SegmentPrior(segmentId: "ROW", priorPoa: 0.7)]
        let r = Posterior.compute(prior: p, events: [cleared("e1", "A", pod: 0.5)], params: params)
        #expect(near(r.remainingMass["A"], 0.15))
        #expect(near(r.cumulativePod["A"], 0.5))
        #expect(near(r.remainingMass["ROW"], 0.7))
    }

    @Test func casieWorkedExample() {
        let p = ["S1", "S2", "S3"].map { SegmentPrior(segmentId: $0, priorPoa: 0.31) } + [SegmentPrior(segmentId: "S4", priorPoa: 0.07)]
        let clue = EngineEvent(eventId: "c1", effect: .clue(influences: [:], authenticity: .high), iocOverride: ["S1": 0.917, "S2": 1, "S3": 0.5, "S4": 0.771])
        let r = Posterior.compute(prior: p, events: [clue], params: params)
        let rounded = ["S1", "S2", "S3", "S4"].map { (r.poa[$0]! * 1000).rounded() / 1000 }
        #expect(rounded == [0.354, 0.386, 0.193, 0.067])
    }

    @Test func posteriorIgnoresDuplicateEventIds() {
        let e1 = cleared("e1", "A", pod: 0.5)
        let once = Posterior.compute(prior: prior, events: [e1], params: params)
        let twice = Posterior.compute(prior: prior, events: [e1, e1], params: params)
        #expect(twice.poa == once.poa)
        #expect(twice.appliedEventIds == ["e1"])
        #expect(twice.ignoredEventIds.isEmpty)
    }

    @Test func rowKeepsItsShareOfMassThroughAClear() {
        let r = Posterior.compute(prior: prior, events: [cleared("e1", "A", pod: 0.5)], params: params)
        #expect(r.poa["ROW"]! > 0.2)
    }

    @Test func orderOfArrivalDoesNotChangeTheResult() {
        let es = [cleared("e2", "B", pod: 0.3), cleared("e1", "A", pod: 0.5),
                  EngineEvent(eventId: "e3", effect: .clue(influences: ["B": .strongFor], authenticity: .medium))]
        let a = Posterior.compute(prior: prior, events: es, params: params)
        let b = Posterior.compute(prior: prior, events: es.reversed(), params: params)
        #expect(a.poa == b.poa)
        #expect(a.appliedEventIds == ["e1", "e2", "e3"])
    }

    @Test func clueTreatsUnlistedSegmentsAndRowAsNeutral() {
        // strong_for at high authenticity keeps A at 1.0; B and ROW get neutral 0.6.
        let r = Posterior.compute(prior: prior, events: [EngineEvent(eventId: "c", effect: .clue(influences: ["A": .strongFor], authenticity: .high))], params: params)
        let w = [0.5 * 1.0, 0.3 * 0.6, 0.2 * 0.6]
        let s = w.reduce(0, +)
        #expect(near(r.poa["A"], w[0] / s))
        #expect(near(r.poa["B"], w[1] / s))
        #expect(near(r.poa["ROW"], w[2] / s))
    }

    @Test func eventForAnUnknownSegmentIsIgnored() {
        let r = Posterior.compute(prior: prior, events: [cleared("e9", "ZZ", pod: 0.9)], params: params)
        #expect(r.ignoredEventIds == ["e9"])
        #expect(r.appliedEventIds.isEmpty)
        #expect(near(r.poa["A"], 0.5))
    }

    @Test func noneEffectIsIgnored() {
        let r = Posterior.compute(prior: prior, events: [EngineEvent(eventId: "n", effect: .none(why: .informational))], params: params)
        #expect(r.ignoredEventIds == ["n"])
    }

    @Test func rankingOrdersByPoaThenIdAndLeavesRowOut() {
        let p = [SegmentPrior(segmentId: "AB", priorPoa: 0.3), SegmentPrior(segmentId: "AA", priorPoa: 0.3), SegmentPrior(segmentId: "AC", priorPoa: 0.2), SegmentPrior(segmentId: "ROW", priorPoa: 0.2)]
        let r = Posterior.compute(prior: p, events: [cleared("e1", "AB", pod: 0.5)], params: params)
        let ranked = Ranking.rank(r, prior: p)
        #expect(ranked.map(\.segmentId) == ["AA", "AC", "AB"])
        #expect(ranked.map(\.rank) == [1, 2, 3])
        #expect(ranked[0].priorPoa == 0.3)
    }
}
