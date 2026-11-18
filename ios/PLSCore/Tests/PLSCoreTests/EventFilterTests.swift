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

    @Test func commandOutranksTheFamilyWhateverTheClocksSay() {
        let s = doc("s1", .sighting, effect: clue(.high))
        var fam = doc("kf", .confirmation, target: "s1", decision: .confirmed, role: .family); fam.clientTimeMs = 9_000
        var cmd = doc("kc", .confirmation, target: "s1", decision: .rejected, role: .command); cmd.clientTimeMs = 1_000
        #expect(ids([s, fam, cmd]).isEmpty)
    }
}

@Suite struct EventDecodingTests {
    @Test func aMalformedStoredEventIsSkippedAndFlaggedNotThrown() throws {
        let good = try JSONValue(encoding: doc("e1", .cleared, effect: clearAC))
        guard case var .object(bad) = try JSONValue(encoding: doc("e2", .cleared, effect: clearAC)),
              case var .object(effect)? = bad["effect"] else { Issue.record("setup"); return }
        effect["inputs"] = nil                                   // a cleared effect with no inputs
        bad["effect"] = .object(effect)
        let noId: JSONValue = .object(["type": .string("cleared")])
        let out = EventFilter.decode([good, .object(bad), noId])
        #expect(out.docs.map(\.eventId) == ["e1"])
        #expect(out.malformedIds == ["e2", "(no id)"])
        #expect(EventFilter.toEngineEvents(out.docs, priorInputEventIds: []).map(\.eventId) == ["e1"])
    }
}

@Suite struct EffectShapeTests {
    let cleared: JSONValue = .object(["kind": .string("cleared"), "segmentId": .string("AC"), "pod": .number(0.5),
        "inputs": .object(["coverage": .number(0.69), "sweepWidthM": .null, "trackLengthM": .null, "areaM2": .number(15625), "rdBasis": .string("open_target")])])

    func with(_ base: JSONValue, _ path: [String], _ value: JSONValue?) -> JSONValue {
        guard case var .object(o) = base else { return base }
        if path.count == 1 { o[path[0]] = value } else { o[path[0]] = with(o[path[0]] ?? .null, Array(path.dropFirst()), value) }
        return .object(o)
    }

    @Test func wellFormedEffectsPass() {
        #expect(EffectShape.isValid(cleared))
        #expect(EffectShape.isValid(.object(["kind": .string("clue"), "influences": .object(["AA": .string("strong_for")]), "authenticity": .string("high")])))
        #expect(EffectShape.isValid(.object(["kind": .string("none"), "why": .string("sound_only")])))
    }

    @Test func sizesFollowTheCreateRule() {
        #expect(EffectShape.isValid(with(cleared, ["segmentId"], .string(String(repeating: "A", count: 16)))))
        #expect(!EffectShape.isValid(with(cleared, ["segmentId"], .string(""))))
        #expect(!EffectShape.isValid(with(cleared, ["segmentId"], .string(String(repeating: "A", count: 17)))))
        func clue(_ n: Int) -> JSONValue {
            .object(["kind": .string("clue"), "authenticity": .string("low"),
                     "influences": .object(Dictionary(uniqueKeysWithValues: (0..<n).map { ("S\($0)", JSONValue.string("for")) }))])
        }
        #expect(EffectShape.isValid(clue(64)))
        #expect(!EffectShape.isValid(clue(65)))
    }

    @Test func everyBrokenShapeFails() {
        #expect(!EffectShape.isValid(.null))
        #expect(!EffectShape.isValid(with(cleared, ["extra"], .number(1))))
        #expect(!EffectShape.isValid(with(cleared, ["pod"], .number(1.5))))
        #expect(!EffectShape.isValid(with(cleared, ["pod"], .string("0.5"))))
        #expect(!EffectShape.isValid(with(cleared, ["inputs", "areaM2"], .number(0))))
        #expect(!EffectShape.isValid(with(cleared, ["inputs", "coverage"], .number(-0.1))))
        #expect(!EffectShape.isValid(with(cleared, ["inputs", "sweepWidthM"], .number(-1))))
        #expect(!EffectShape.isValid(with(cleared, ["inputs", "rdBasis"], .string("guess"))))
        #expect(!EffectShape.isValid(with(cleared, ["inputs", "trackLengthM"], nil)))
        #expect(!EffectShape.isValid(.object(["kind": .string("clue"), "influences": .object([:]), "authenticity": .string("high")])))
        #expect(!EffectShape.isValid(.object(["kind": .string("clue"), "influences": .object(["AA": .string("maybe")]), "authenticity": .string("high")])))
        #expect(!EffectShape.isValid(.object(["kind": .string("none")])))
    }

    @Test func decodeSkipsAnEffectThatDecodesButBreaksTheShape() throws {
        guard case var .object(d) = try JSONValue(encoding: doc("e9", .clue, effect: clue(.high))) else { Issue.record("setup"); return }
        d["effect"] = .object(["kind": .string("clue"), "influences": .object([:]), "authenticity": .string("high")])
        #expect(EventFilter.decode([.object(d)]).malformedIds == ["e9"])
    }
}

