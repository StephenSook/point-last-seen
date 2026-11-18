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
