import Foundation
import Testing
@testable import PLSCore

/// The report-reading eval's scoring: each arm's readings against the person-written answers, with
/// 95% Wilson intervals and an exact McNemar test for the paired comparison of two arms.
@Suite struct EvalScorerTests {
    let threeRows = [
        EvalRow(id: "r1", group: "fresh", text: "Cleared BO, nothing seen.", kind: .cleared, segmentIds: ["BO"], feature: nil),
        EvalRow(id: "r2", group: "fresh", text: "Blue coat by the creek in BP.", kind: .clue, segmentIds: ["BP"], feature: .creekOrDrainage),
        EvalRow(id: "r3", group: "seen", text: "Saw her near the trail in BQ.", kind: .sighting, segmentIds: ["BQ"], feature: .trail),
    ]
    var right: EvalOutput { EvalOutput(reading: reading(kind: .cleared, segmentIds: ["BO"]), blocked: false) }
    var wrongSegment: EvalOutput {
        var r = reading(kind: .clue, segmentIds: ["BO"])
        r.feature = .creekOrDrainage
        return EvalOutput(reading: r, blocked: false)
    }
    var unclear: EvalOutput { EvalOutput(reading: .unclear(), blocked: false) }

    @Test func scorerCountsKindSegmentAndMisses() {
        let s = EvalScorer.score(rows: threeRows, outputs: ["r1": right, "r2": wrongSegment, "r3": unclear])
        #expect(s.n == 3)
        #expect(s.kindCorrect == 2)
        #expect(s.segmentCorrect == 1)
        #expect(s.featureScored == 2 && s.featureCorrect == 1)
        #expect(s.misses == ["r2", "r3"])
    }

    /// A row with no output counts as invalid, a refused read as blocked; both are misses.
    @Test func noReadingIsInvalidAndARefusalIsBlocked() {
        let s = EvalScorer.score(rows: threeRows, outputs: ["r1": right, "r2": EvalOutput(reading: nil, blocked: true)])
        #expect(s.invalid == 1 && s.blocked == 1)
        #expect(s.misses == ["r2", "r3"])
    }

    /// The segment answer is the set of ids, in any order.
    @Test func segmentOrderDoesNotMatter() {
        let row = EvalRow(id: "r1", group: "fresh", text: "Cleared BO and BP.", kind: .cleared, segmentIds: ["BO", "BP"], feature: nil)
        let out = EvalOutput(reading: reading(kind: .cleared, segmentIds: ["BP", "BO"]), blocked: false)
        #expect(EvalScorer.score(rows: [row], outputs: ["r1": out]).segmentCorrect == 1)
    }

    @Test func freshAndSeenGroupsAreScoredApart() {
        let groups = EvalScorer.scoreByGroup(rows: threeRows, outputs: ["r1": right, "r2": wrongSegment, "r3": unclear])
        #expect(groups["fresh"]?.n == 2 && groups["fresh"]?.kindCorrect == 2)
        #expect(groups["seen"]?.n == 1 && groups["seen"]?.kindCorrect == 0)
    }

    /// The answer key as a person writes it: rows numbered from 1, a kind, up to two segments (an
    /// empty list means no segment is expected) and a feature, "none" included.
    @Test func theAnswerKeyReadsIntoRows() throws {
        let json = """
        {"answerKey":"pls-drill-reports-v1","writtenBy":"person","grid":"piedmont-park-dev","rows":[
          {"n":1,"text":"Blue coat by the creek in BO.","kind":"clue","segments":["BO"],"feature":"creek_or_drainage"},
          {"n":2,"text":"Heard nothing, not sure where we are.","kind":"unclear","segments":[],"feature":"none"}]}
        """
        let key = try JSONDecoder().decode(EvalAnswerKey.self, from: Data(json.utf8))
        #expect(key.answerKey == "pls-drill-reports-v1" && key.writtenBy == "person" && key.grid == "piedmont-park-dev")
        #expect(key.evalRows == [
            EvalRow(id: "n1", group: "fresh", text: "Blue coat by the creek in BO.", kind: .clue, segmentIds: ["BO"], feature: .creekOrDrainage),
            EvalRow(id: "n2", group: "fresh", text: "Heard nothing, not sure where we are.", kind: .unclear, segmentIds: [], feature: Feature.none),
        ])
    }

    /// No segment expected: right only when the reading names none.
    @Test func anEmptySegmentListExpectsNoSegment() {
        let row = EvalRow(id: "n2", group: "fresh", text: "Not sure where we are.", kind: .unclear, segmentIds: [], feature: nil)
        let none = EvalOutput(reading: .unclear(), blocked: false)
        let some = EvalOutput(reading: reading(kind: .unclear, segmentIds: ["BO"]), blocked: false)
        #expect(EvalScorer.score(rows: [row], outputs: ["n2": none]).segmentCorrect == 1)
        #expect(EvalScorer.score(rows: [row], outputs: ["n2": some]).segmentCorrect == 0)
    }

    @Test func wilsonIntervalForTwentyOfTwenty() {
        let (lo, hi) = EvalScorer.wilson(successes: 20, n: 20)
        #expect(abs(lo - 0.839) < 0.002)
        #expect(hi == 1.0)
        let (lo2, hi2) = EvalScorer.wilson(successes: 0, n: 0)
        #expect(lo2 == 0 && hi2 == 1)
    }

    @Test func mcnemarIsOneWhenDiscordantCountsAreEqual() {
        #expect(EvalScorer.mcnemarExact(bOnly: 3, cOnly: 3) == 1.0)
        #expect(EvalScorer.mcnemarExact(bOnly: 0, cOnly: 0) == 1.0)
        // 6 discordant pairs all one way: two-sided exact p = 2 / 64.
        #expect(abs(EvalScorer.mcnemarExact(bOnly: 6, cOnly: 0) - 2.0 / 64.0) < 1e-12)
    }

    /// The paired comparison counts the rows only one arm got right.
    @Test func thePairedComparisonCountsRowsOnlyOneArmGotRight() {
        let model = ["r1": right, "r2": wrongSegment, "r3": unclear]
        let rules = ["r1": unclear, "r2": wrongSegment, "r3": unclear]
        let pair = EvalScorer.paired(rows: threeRows, a: model, b: rules)
        #expect(pair.aOnly == 1 && pair.bOnly == 0)
    }
}
