import Testing
@testable import PLSCore

@Suite struct ValidatorTests {
    let raw = "Team two cleared segment AC, nothing found"
    func ok() -> ReportReading { reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "cleared segment AC") }

    @Test func aGoodReadingPasses() {
        #expect(ReadingValidator.validate(ok(), knownSegmentIds: ["AC"], rawText: raw).isOK)
    }

    @Test func validatorRejectsUnknownIdsAndBadNumbers() {
        var r = ok(); r.segmentIds = ["ZZ"]
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AA"], rawText: raw).isOK == false)
        r = ok(); r.coverage = .nan
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
        r = ok(); r.coverage = 4
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
        r = ok(); r.minutes = -5
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
        r = ok(); r.searchers = 2.5
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
        r = ok(); r.detectionRangeM = 500
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
    }

    @Test func moreThanThreeSegmentsIsInvalid() {
        var r = ok(); r.segmentIds = ["AA", "AB", "AC", "AD"]
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AA", "AB", "AC", "AD"], rawText: raw).isOK == false)
    }

    @Test func itemLongerThan40CharactersIsInvalid() {
        var r = ok(); r.item = String(repeating: "x", count: 41)
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
    }

    @Test func quoteMustComeFromTheText() {
        var r = ok(); r.evidenceQuote = "not in the text"
        let v = ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw)
        #expect(v.isOK == false)
        #expect(v == .invalid(reasons: ["quote_not_in_text"]))
        r.evidenceQuote = "CLEARED  segment ac"     // case and spacing may differ
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK)
        r.evidenceQuote = ""
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw).isOK == false)
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: "").isOK)
    }

    @Test func reasonsListEveryProblem() {
        var r = ok(); r.segmentIds = ["ZZ"]; r.coverage = 9
        #expect(ReadingValidator.validate(r, knownSegmentIds: ["AC"], rawText: raw) == .invalid(reasons: ["unknown_segment:ZZ", "coverage_out_of_range"]))
    }
}
