import Foundation
import Testing
@testable import PLSCore

@Suite struct RetractionTests {
    let target = doc("0123456789abcdef0123456789abcdef", .cleared, effect: clearAC, author: "uid-1")

    @Test func anUndoIsARetractionOfTheSameAuthorsEvent() throws {
        let r = try ReadOutcomeBuilder.retraction(of: target, authorUid: "uid-1", deviceId: "uid-1", seq: 99, clientTimeMs: 2_000)
        #expect(r.type == .retraction)
        #expect(r.targetEventId == target.eventId)
        #expect(r.effect == .none(why: .informational))
        #expect(r.eventId == EventID.make(incidentId: target.incidentId, deviceId: "uid-1", seq: 99))
        #expect(r.rawText == nil && r.reading == nil && r.route == nil && r.position == nil)
        #expect(r.role == .searcher && r.inputMethod == .system && r.priorVersion == target.priorVersion)
        #expect(EventFilter.toEngineEvents([target, r], priorInputEventIds: []).isEmpty)
    }

    @Test func aSearcherCannotRetractSomeoneElsesEvent() {
        #expect(throws: ReadOutcomeBuilder.RetractionError.notTheAuthor) {
            try ReadOutcomeBuilder.retraction(of: target, authorUid: "uid-2", deviceId: "uid-2", seq: 1, clientTimeMs: 2_000)
        }
    }

    @Test func undoIsOfferedOnlyForFiveSeconds() {
        #expect(ReadOutcomeBuilder.canUndo(sentAtMs: 1_000, nowMs: 5_999))
        #expect(ReadOutcomeBuilder.canUndo(sentAtMs: 1_000, nowMs: 6_001) == false)
    }
}
