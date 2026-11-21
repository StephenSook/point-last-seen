import Testing
@testable import PLSCore

@Suite struct ReportParserTests {
    let ctx = ParseContext(knownSegmentIds: ["AA", "AB", "AC", "AD", "AN", "AT"])

    @Test func parserReturnsUnclearForEmptyAndOverlongText() {
        #expect(ReportParser.parse("", context: ctx).kind == .unclear)
        #expect(ReportParser.parse("   ", context: ctx).kind == .unclear)
        #expect(ReportParser.parse(String(repeating: "word ", count: 500), context: ctx).kind == .unclear)
    }

    @Test func parserReadsCoverageAsRatioAndAsPercent() {
        let a = ReportParser.parse("Team two cleared segment AC, coverage point eight, nothing found", context: ctx)
        #expect(a.coverage == 0.8)
        #expect(a.kind == .cleared)
        #expect(a.segmentIds == ["AC"])
        #expect(ReportParser.parse("cleared segment AC, eighty percent coverage", context: ctx).coverage == 80)   // normalized later, by code
        #expect(ReportParser.parse("cleared AC coverage 0.6", context: ctx).coverage == 0.6)
        #expect(ReportParser.parse("cleared AC, 75% coverage", context: ctx).coverage == 75)
        #expect(ReportParser.parse("cleared AC coverage one point five", context: ctx).coverage == 1.5)
    }

    @Test func parserNeverInventsASegment() {
        #expect(ReportParser.parse("cleared it at the end, all good", context: ctx).segmentIds.isEmpty)
    }

    @Test func anUnknownSegmentNamedAfterTheWordSegmentIsKeptSoValidationRejectsIt() {
        let r = ReportParser.parse("cleared segment ZZ", context: ctx)
        #expect(r.segmentIds == ["ZZ"])
        #expect(ReadingValidator.validate(r, knownSegmentIds: ctx.knownSegmentIds, rawText: "cleared segment ZZ").isOK == false)
    }

    @Test func commonWordsAfterTheWordSegmentAreNotSegmentNames() {
        #expect(ReportParser.parse("we cleared the segment by the creek", context: ctx).segmentIds.isEmpty)
        #expect(ReportParser.parse("cleared segment AT", context: ctx).segmentIds == ["AT"])     // a known id that is also a word
    }

    @Test func commonTwoLetterWordsAreNotSegments() {
        #expect(ReportParser.parse("we cleared it at the bend, an easy walk", context: ctx).segmentIds.isEmpty)
        #expect(ReportParser.parse("cleared segment at", context: ctx).segmentIds == ["AT"])
        #expect(ReportParser.parse("cleared segment a c", context: ctx).segmentIds == ["AC"])
    }

    @Test func minutesSearchersAndType() {
        let r = ReportParser.parse("hasty search of AB, 3 searchers for forty five minutes", context: ctx)
        #expect(r.minutes == 45)
        #expect(r.searchers == 3)
        #expect(r.searchType == .hasty)
        #expect(ReportParser.parse("swept AD for an hour, four searchers", context: ctx).minutes == 60)
        #expect(ReportParser.parse("swept AD for an hour, four searchers", context: ctx).searchers == 4)
        #expect(ReportParser.parse("line search of AD", context: ctx).searchType == .sweep)
    }

    @Test func soundOnlyAndVisualMethods() {
        #expect(ReportParser.parse("cleared AB by calling only", context: ctx).method == .sound)
        #expect(ReportParser.parse("cleared AB, looked under every bush", context: ctx).method == .visual)
        #expect(ReportParser.parse("cleared AB, called and looked", context: ctx).method == .both)
    }

    @Test func clueWithItemFeatureDirectionAndColors() {
        let r = ReportParser.parse("found a slipper by the creek in AC, tracks heading downstream, red jacket seen", context: ctx)
        #expect(r.kind == .clue)
        #expect(r.item == "slipper")
        #expect(r.footwear == "slipper")
        #expect(r.feature == .creekOrDrainage)
        #expect(r.direction == .downstream)
        #expect(r.topColor == .red)
        #expect(ReportParser.parse("sighting near the road, walking north east", context: ctx).direction == .ne)
        #expect(ReportParser.parse("someone saw a man in blue jeans on the trail", context: ctx).kind == .sighting)
        #expect(ReportParser.parse("someone saw a man in blue jeans on the trail", context: ctx).bottomColor == .blue)
    }

    @Test func foundTheSubjectIsFoundButNothingFoundIsNot() {
        #expect(ReportParser.parse("found her, she is safe, in AD", context: ctx).kind == .found)
        #expect(ReportParser.parse("cleared AA nothing found", context: ctx).kind == .cleared)
    }

    @Test func quoteIsAlwaysFromTheText() {
        let text = "Team two cleared segment AC, coverage point eight, nothing found"
        let r = ReportParser.parse(text, context: ctx)
        #expect(ReadingValidator.validate(r, knownSegmentIds: ctx.knownSegmentIds, rawText: text).isOK || r.coverage == 0.8)
        #expect(text.lowercased().contains(r.evidenceQuote.lowercased()))
        #expect(r.item.count <= 40)
    }

    @Test func aNegativeCoverageKeepsItsSignSoItIsRejected() {
        let r = ReportParser.parse("cleared segment AC, coverage -0.8", context: ctx)
        #expect(r.coverage == -0.8)
        #expect(SearchMath.normalizeCoverage(r.coverage) == .invalid)
        #expect(PermissiveLine.parse("cleared|AC|-0.8", known: ["AC"])?.coverage == -0.8)
        #expect(Tokens("AC-2 coverage 0.5").lower == ["ac", "2", "coverage", "0.5"])          // a hyphen after letters is not a sign
    }

    @Test func negatedAndOnlyWordsDecideTheMethod() {
        #expect(ReportParser.parse("cleared AC by calling only, no visual search, coverage 1", context: ctx).method == .sound)
        #expect(ReportParser.parse("we just called out in AC", context: ctx).method == .sound)
        #expect(ReportParser.parse("cleared AC, no calling, looked everywhere", context: ctx).method == .visual)
        #expect(ReportParser.parse("cleared AB, called and looked", context: ctx).method == .both)
    }

    @Test func aSoundOnlyRulesReadingIsNotCounted() {
        let text = "cleared AC by calling only, no visual search, coverage 1"
        let r = ReportParser.parse(text, context: ctx)
        #expect(EffectDeriver.cleared(reading: r, context: EffectContext(grid: grid, assignedSegmentIds: ["AC"], position: nil, visualDetectionRangeM: 10, rdBasis: .openTarget), params: params) == .none(why: .soundOnly))
    }

    @Test func halfAnHourIsThirtyMinutes() {
        #expect(ReportParser.minutesAgo("saw her half an hour ago in AC") == 30)
        #expect(ReportParser.minutesAgo("saw her an hour ago in AC") == 60)
        #expect(ReportParser.parse("swept AD for half an hour, three searchers", context: ctx).minutes == 30)
    }

    // The parser also reads the numbers a model leaves empty, so it must read only search numbers, exactly.

    private func near(_ a: Double?, _ b: Double) -> Bool { a.map { abs($0 - b) < 1e-9 } ?? false }


    /// "In 30 minutes" is when something happens next, not how long the team searched.
    @Test(arguments: [
        "Searched segment AE with 2 searchers. Next radio check in 30 minutes.",
        "Searched segment AE with 2 searchers, checking in every 2 hours.",
        "Searched segment AE with 2 searchers. Back at base in about 1 hour.",
    ])
    func aTimeThatIsNotTheSearchIsNotItsMinutes(text: String) {
        #expect(ReportParser.minutes(Tokens(text)) == nil)
    }

    @Test func searchMinutesStillRead() {
        #expect(ReportParser.minutes(Tokens("Searched segment AE for 30 minutes, nothing found.")) == 30)
        #expect(ReportParser.minutes(Tokens("Two hours in segment AE, nothing found.")) == 120)
        #expect(ReportParser.minutes(Tokens("Searched AE for 45 minutes. Next radio check in 30 minutes.")) == 45)
    }

    /// A stated percent is a percent: "1%" is 0.01, never 1 read as a whole ratio (normalizing reads up to 3 as one).
    @Test(arguments: [
        ("Cleared segment AE, coverage 1%.", 0.01),
        ("Cleared segment AE, coverage 1 percent.", 0.01),
        ("Cleared segment AE, 1 percent coverage.", 0.01),
        ("Cleared segment AE, coverage 3%.", 0.03),
        ("Cleared segment AE, coverage 80%.", 0.8),
        ("Cleared segment AE, 70 percent coverage.", 0.7),
    ])
    func aStatedPercentIsAPercent(text: String, ratio: Double) {
        guard case let .ratio(r) = SearchMath.normalizeCoverage(ReportParser.coverage(Tokens(text))) else {
            Issue.record("no ratio for \(text)"); return
        }
        #expect(near(r, ratio))
    }

    /// ".7" is 0.7 and "-.7" stays negative, so it is refused, never read as 7 (0.07).
    @Test func aLeadingDotKeepsItsNumberAndItsSign() {
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage .7.")), 0.7))
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage -.7.")), -0.7))
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage 0.7.")), 0.7))
    }

    /// "In 30 minutes" is a search time unless the words before it say what happens next.
    @Test func inMinutesIsTheSearchTimeUnlessItSaysWhatHappensNext() {
        #expect(ReportParser.minutes(Tokens("We searched segment AE in 30 minutes with 2 searchers.")) == 30)
        #expect(ReportParser.minutes(Tokens("Cleared AE in 45 minutes, nothing found.")) == 45)
        #expect(ReportParser.minutes(Tokens("Searched segment AE with 2 searchers. Next radio check in 30 minutes.")) == nil)
        #expect(ReportParser.minutes(Tokens("Searched AE with 2 searchers, will report again in 20 minutes.")) == nil)
    }

    /// A second unit joined by "and" belongs to the same time phrase as the first.
    @Test func aJoinedTimeKeepsItsFirstPartsMeaning() {
        #expect(ReportParser.minutes(Tokens("Searched segment AE with 2 searchers. Next check in 1 hour and 30 minutes.")) == nil)
    }

    /// A minus sign pasted as U+2212 is still a minus sign.
    @Test func aUnicodeMinusKeepsTheNumberNegative() {
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage \u{2212}.7.")), -0.7))
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage \u{2212}0.7.")), -0.7))
    }

    /// "Per" alone is not a percent; "per cent" is.
    @Test func perAloneIsNotAPercent() {
        #expect(ReportParser.coverage(Tokens("Cleared segment AE, coverage 1 per the field lead.")) == 1)
        #expect(near(ReportParser.coverage(Tokens("Cleared segment AE, coverage 1 per cent.")), 0.01))
    }

    /// A sighting cannot be in the future: a negative "minutes ago" is not read.
    @Test func aNegativeMinutesAgoIsNotRead() {
        #expect(ReportParser.minutesAgo("Saw her -.7 minutes ago in AE.") == nil)
        #expect(ReportParser.minutesAgo("Saw her -5 minutes ago in AE.") == nil)
        #expect(ReportParser.minutesAgo("Saw her 5 minutes ago in AE.") == 5)
    }

    /// An explicit search time beats an "in N minutes" one, which may be a countdown ("pickup in 45 minutes").
    @Test func anExplicitSearchTimeBeatsAnInTime() {
        #expect(ReportParser.minutes(Tokens("Cleared AE with two searchers. Pickup in 45 minutes. Search took 10 minutes.")) == 10)
        #expect(ReportParser.minutes(Tokens("Cleared AE in 45 minutes with two searchers.")) == 45)
    }

    /// A sentence that starts with "And" is a new sentence, not a joined unit.
    @Test func aSentenceStartingWithAndIsNotJoined() {
        #expect(ReportParser.minutes(Tokens("Next radio check in an hour. And 30 minutes spent on the search.")) == 30)
        #expect(ReportParser.minutes(Tokens("Searched segment AE with 2 searchers. Next check in 1 hour and 30 minutes.")) == nil)
    }
}
