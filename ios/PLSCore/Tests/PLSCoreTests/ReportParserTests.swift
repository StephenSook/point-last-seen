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
}
