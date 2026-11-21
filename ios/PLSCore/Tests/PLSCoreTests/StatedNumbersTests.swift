import Foundation
import Testing
@testable import PLSCore

/// Apple's model leaves every number in its reading empty (a stated "coverage 0.7" came back nil on the simulator),
/// and when a schema made it fill each number it invented ones the report never stated. So a number the model left
/// empty is read from the report's own words by the rules parser, which reads only stated numbers, and the outcome
/// says the numbers came from the rules, for the receipt.
@Suite struct StatedNumbersTests {
    private func context() -> ReadContext {
        ReadContext(incidentMode: "drill", knownSegmentIds: ["AA", "AE", "BO"], networkOnline: false,
                    onDevice: OnDeviceStatus(available: true, localeSupported: true, contextSize: 4096, variant: "AFM 3 Core Advanced"),
                    estimatedTokens: 400, tokenBudgetFraction: 0.5, cloudConsent: false, killCloud: true,
                    cloudModel: "gemini-3.5-flash-lite", screen: EvidenceScreen(terms: ["blood"]))
    }

    /// The reading Apple's model gave for these reports: the kind and the ids the report names, and no numbers.
    private func modelRead(_ text: String, ids: [String] = [], coverage: Double? = nil) async -> ReadOutcome {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ids, coverage: coverage, evidenceQuote: text))]
        return await ReadOrchestrator.read(text: text, context: context(), runner: r, clock: FixedClock(ms: [1_000, 1_850]))
    }

    private func near(_ a: Double?, _ b: Double) -> Bool { a.map { abs($0 - b) < 1e-9 } ?? false }

    @Test(arguments: [
        ("Cleared the trail from the bridge to the bend, coverage point seven. Nothing seen.", [String](), 0.7),
        ("Cleared the trail from the bridge to the bend, coverage 0.7. Nothing seen.", [], 0.7),
        ("Cleared segment AE, coverage 0.7, nothing found.", ["AE"], 0.7),
        ("Cleared segment BO, coverage point eight, nothing found.", ["BO"], 0.8),
    ])
    func aStatedCoverageTheModelLeftEmptyIsReadByRules(text: String, ids: [String], coverage: Double) async {
        let o = await modelRead(text, ids: ids)
        #expect(near(o.reading.coverage, coverage))
        #expect(o.numbersFromRules)
        // The kind, the ids and the route stay the model's.
        #expect(o.reading.kind == .cleared && o.route.path == .onDevice && o.route.stage == .guided)
    }

    @Test func minutesAndSearchersTheModelLeftEmptyAreReadByRules() async {
        let o = await modelRead("Searched segment AE for 30 minutes with 2 searchers, we could see 20 meters, nothing found.", ids: ["AE"])
        #expect(o.reading.minutes == 30 && o.reading.searchers == 2 && o.reading.coverage == nil)
        #expect(o.numbersFromRules)
    }

    @Test func aNumberTheModelGaveIsNotReplaced() async {
        let o = await modelRead("Cleared segment AE, coverage 0.6, nothing found.", ids: ["AE"], coverage: 0.6)
        #expect(near(o.reading.coverage, 0.6))
        #expect(!o.numbersFromRules)
    }

    @Test func aReportThatStatesNoNumberGetsNone() async {
        let o = await modelRead("Cleared the trail from the bridge to the bend. Nothing seen.")
        #expect(o.reading.coverage == nil && o.reading.minutes == nil && o.reading.searchers == nil)
        #expect(!o.numbersFromRules)
    }

    /// The permissive line carries only kind, ids and coverage; the rest comes from the parser, and the outcome says so.
    @Test func aPermissiveReadSaysWhenItsNumbersCameFromTheRules() async {
        let text = "Cleared segment AE, coverage 0.7, nothing found."
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        r.permissiveResults = [.success("KIND: cleared, SEGMENTS: AE, COVERAGE: none")]
        let o = await ReadOrchestrator.read(text: text, context: context(), runner: r, clock: FixedClock(ms: [1_000, 1_850]))
        #expect(o.route.stage == .permissiveText && near(o.reading.coverage, 0.7) && o.numbersFromRules)

        let given = FakeRunner()
        given.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        given.permissiveResults = [.success("KIND: cleared, SEGMENTS: AE, COVERAGE: 0.7")]
        let g = await ReadOrchestrator.read(text: text, context: context(), runner: given, clock: FixedClock(ms: [1_000, 1_850]))
        #expect(g.route.stage == .permissiveText && near(g.reading.coverage, 0.7) && !g.numbersFromRules)
    }

    /// A reading by the rules alone says so already ("Read by rules, not a model"), so it carries no extra line.
    @Test func aRulesReadingCarriesNoNumbersLine() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.parseFailed)]
        r.permissiveResults = [.failure(.parseFailed)]
        let o = await ReadOrchestrator.read(text: "Cleared segment AE, coverage 0.7, nothing found.", context: context(), runner: r,
                                            clock: FixedClock(ms: [1_000, 1_850]))
        #expect(o.route.path == .rules && near(o.reading.coverage, 0.7) && !o.numbersFromRules)
    }

    /// A stated number the app refuses is never silently dropped: the model's reading is not used without it (its
    /// effort numbers could then clear the area), and the read ends where the rules alone end, refused.
    @Test(arguments: [
        "Cleared segment AE, coverage 400, nothing found.",
        "Cleared segment AE, coverage -.7, after 30 minutes with 2 searchers.",
    ])
    func aStatedNumberTheAppRefusesIsNotDropped(text: String) async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AE"], minutes: 30, searchers: 2, evidenceQuote: text))]
        let o = await ReadOrchestrator.read(text: text, context: context(), runner: r, clock: FixedClock(ms: [1_000, 1_850]))
        #expect(o.route.path == .rules && !o.validation.isOK && !o.numbersFromRules)
    }

    /// Numbers matter only to a cleared report, so a sighting keeps its valid reading whatever the rules count.
    @Test func aSightingIsNotFilled() async {
        let text = "Saw her by the stadium in AE 10 minutes ago. There were 200 people at the entrance."
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(kind: .sighting, segmentIds: ["AE"], evidenceQuote: text))]
        let o = await ReadOrchestrator.read(text: text, context: context(), runner: r, clock: FixedClock(ms: [1_000, 1_850]))
        #expect(o.route.stage == .guided && o.reading.kind == .sighting && o.reading.searchers == nil && !o.numbersFromRules)
    }

    /// A time or count the rules misread out of range is left out; only a stated coverage refuses the read.
    @Test func aMisreadCountIsLeftOutNotRefused() async {
        let o = await modelRead("Cleared segment AE, coverage 0.7, 200 people at the trailhead.", ids: ["AE"])
        #expect(o.route.stage == .guided && near(o.reading.coverage, 0.7) && o.reading.searchers == nil && o.numbersFromRules)
    }

    /// The quote retry still sees only the model's own reasons: a refused stated number does not skip it.
    @Test func theQuoteRetryIsNotSkippedBecauseOfAFill() async {
        let text = "Cleared segment AE, coverage 400, nothing found."
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AE"], evidenceQuote: "")),
                                      .success(reading(segmentIds: ["AE"], evidenceQuote: text))]
        let o = await ReadOrchestrator.read(text: text, context: context(), runner: r, clock: FixedClock(ms: [1_000, 1_850, 2_000]))
        #expect(r.calls == [.guided(.onDevice), .guided(.onDevice)])
        #expect(o.route.path == .rules && !o.validation.isOK)
    }

    /// The permissive line's own coverage keeps a stated percent: "1%" is 0.01, as the parser reads it.
    @Test func aPermissiveLineKeepsAStatedPercent() {
        #expect(near(PermissiveLine.parse("cleared|AE|1%", known: ["AE"])?.coverage, 0.01))
        #expect(near(PermissiveLine.parse("KIND: cleared, SEGMENTS: AE, COVERAGE: 1 percent", known: ["AE"])?.coverage, 0.01))
        #expect(near(PermissiveLine.parse("cleared|AE|0.7", known: ["AE"])?.coverage, 0.7))
        #expect(near(PermissiveLine.parse("cleared|AE|80%", known: ["AE"])?.coverage, 80))
    }

    @Test func theReceiptLineSaysTheNumbersCameFromTheRules() {
        #expect(EchoText.numbersByRules == "Numbers read by rules.")
    }

    /// The flag lives only in this phone's journal, like the found-kind note: an older journal without it still loads.
    @Test func theJournalKeepsTheFlagAndReadsAnOlderEntryWithoutIt() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("numbers-\(UUID().uuidString).json")
        var box = try Outbox(fileURL: url)
        try box.add(doc("e1", .cleared), numbersFromRules: true)
        try box.add(doc("e2", .clue))
        #expect(try Outbox(fileURL: url).entries.map(\.numbersFromRules) == [true, nil])
        let data = try JSONEncoder().encode(OutboxEntry(doc: doc("e3", .cleared), state: .pending, lastError: nil, numbersFromRules: true))
        var old = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        old.removeValue(forKey: "numbersFromRules")
        let older = try JSONDecoder().decode(OutboxEntry.self, from: JSONSerialization.data(withJSONObject: old))
        #expect(older.numbersFromRules == nil)
    }
}
