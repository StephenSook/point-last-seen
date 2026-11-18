import Foundation
import Testing
@testable import PLSCore

@Suite struct EventFilterTests {
    func ids(_ docs: [EventDoc], prior: [String] = []) -> [String] {
        EventFilter.toEngineEvents(docs, priorInputEventIds: prior).map(\.eventId)
    }

    @Test func clearedCountsAndRetractionRemovesIt() {
        #expect(ids([doc("e1", .cleared, effect: clearAC)]) == ["e1"])
        #expect(ids([doc("e1", .cleared, effect: clearAC), doc("r1", .retraction, target: "e1")]).isEmpty)
    }

    @Test func clearedWithNoneEffectDoesNotCount() {
        #expect(ids([doc("e1", .cleared, effect: .none(why: .soundOnly))]).isEmpty)
    }

    @Test func lowAuthenticityClueDoesNotCount() {
        #expect(ids([doc("c1", .clue, effect: clue(.high)), doc("c2", .clue, effect: clue(.medium)), doc("c3", .clue, effect: clue(.low))]) == ["c1", "c2"])
    }

    @Test func sightingCountsOnlyAfterConfirmation() {
        let s = doc("s1", .sighting, effect: clue(.medium))
        #expect(ids([s]).isEmpty)
        #expect(ids([s, doc("k1", .confirmation, target: "s1", decision: .rejected, role: .command)]).isEmpty)
        #expect(ids([s, doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .command)]) == ["s1"])
    }

    @Test func retractedConfirmationNoLongerConfirms() {
        let docs = [doc("s1", .sighting, effect: clue(.high)), doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .command),
                    doc("r1", .retraction, target: "k1", role: .command)]
        #expect(ids(docs).isEmpty)
    }

    @Test func cameraSightingIsNeverALikelihood() {
        let cam = doc("cam", .cameraSighting, effect: .none(why: .incorporatedInPrior), role: .family)
        #expect(EventFilter.toEngineEvents([cam, doc("k", .confirmation, target: "cam", decision: .confirmed, role: .command)], priorInputEventIds: ["cam"]).isEmpty)
        #expect(ids([cam, doc("k", .confirmation, target: "cam", decision: .confirmed, role: .command)]).isEmpty)
    }

    @Test func destinationIsNeverALikelihood() {
        #expect(ids([doc("d", .destination, effect: clue(.high), role: .command), doc("k", .confirmation, target: "d", decision: .confirmed, role: .command)]).isEmpty)
    }

    @Test func eventsListedAsPriorInputsAreSkipped() {
        let docs = [doc("s1", .sighting, effect: clue(.high)), doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .command)]
        #expect(ids(docs, prior: ["s1"]).isEmpty)
    }

    @Test func confirmedSightingOutsideTheGridChangesNothing() {
        let docs = [doc("s1", .sighting, effect: .none(why: .outsideArea)), doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .command)]
        #expect(ids(docs).isEmpty)
    }

    @Test func duplicateIdsCountOnceAndOutputIsSorted() {
        #expect(ids([doc("e2", .cleared, effect: clearAC), doc("e1", .cleared, effect: clearAC), doc("e2", .cleared, effect: clearAC)]) == ["e1", "e2"])
    }

    @Test func otherTypesHaveNoEffect() {
        #expect(ids([doc("f", .found), doc("p", .planAck)]).isEmpty)
    }
}

@Suite struct EventFilterRoleTests {
    func ids(_ docs: [EventDoc]) -> [String] { EventFilter.toEngineEvents(docs, priorInputEventIds: []).map(\.eventId) }

    @Test func aSearcherCannotConfirmASighting() {
        let s = doc("s1", .sighting, effect: clue(.high))
        #expect(ids([s, doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .searcher)]).isEmpty)
        #expect(ids([s, doc("k1", .confirmation, target: "s1", decision: .confirmed, role: .family)]) == ["s1"])
    }

    @Test func onlyTheAuthorOrCommandCanRetract() {
        let e = doc("e1", .cleared, effect: clearAC, author: "u1")
        #expect(ids([e, doc("r1", .retraction, target: "e1", role: .searcher, author: "u2")]) == ["e1"])
        #expect(ids([e, doc("r1", .retraction, target: "e1", role: .searcher, author: "u1")]).isEmpty)
        #expect(ids([e, doc("r1", .retraction, target: "e1", role: .command, author: "u9")]).isEmpty)
    }

    @Test func aClearWhosePodDisagreesWithItsCoverageIsDropped() {
        let bad = Effect.cleared(segmentId: "AC", pod: 1.0, inputs: ClearedInputs(coverage: 0.2, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget))
        let good = Effect.cleared(segmentId: "AC", pod: 1 - exp(-0.2), inputs: ClearedInputs(coverage: 0.2, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget))
        let tooBig = Effect.cleared(segmentId: "AC", pod: 1 - exp(-9), inputs: ClearedInputs(coverage: 9, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget))
        #expect(ids([doc("e1", .cleared, effect: bad), doc("e2", .cleared, effect: good), doc("e3", .cleared, effect: tooBig)]) == ["e2", "e3"])   // computed coverage may exceed 3
    }
}

@Suite struct EventFilterConfirmationTests {
    func ids(_ docs: [EventDoc]) -> [String] { EventFilter.toEngineEvents(docs, priorInputEventIds: []).map(\.eventId) }
    func confirm(_ id: String, _ d: Decision, at t: Double) -> EventDoc {
        var k = doc(id, .confirmation, target: "s1", decision: d, role: .command); k.clientTimeMs = t; return k
    }

    @Test func theLatestConfirmationDecides() {
        let s = doc("s1", .sighting, effect: clue(.high))
        #expect(ids([s, confirm("k1", .confirmed, at: 1), confirm("k2", .rejected, at: 2)]).isEmpty)
        #expect(ids([s, confirm("k1", .rejected, at: 1), confirm("k2", .confirmed, at: 2)]) == ["s1"])
        #expect(ids([s, confirm("kb", .confirmed, at: 5), confirm("ka", .rejected, at: 5)]) == ["s1"])     // same time: higher id wins
    }

    @Test func theFirstCopyOfARepeatedIdWins() {
        #expect(ids([doc("e1", .cleared, effect: clearAC), doc("e1", .found)]) == ["e1"])
        #expect(ids([doc("e1", .found), doc("e1", .cleared, effect: clearAC)]).isEmpty)
    }
}
