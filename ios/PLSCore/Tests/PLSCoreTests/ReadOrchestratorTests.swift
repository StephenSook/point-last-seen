import Foundation
import Testing
@testable import PLSCore

/// A runner that replays scripted results and records every call, so the tests can prove
/// which model was asked, in which order.
final class FakeRunner: ReadModelRunner, @unchecked Sendable {
    enum Call: Equatable { case guided(RoutePath), permissive }
    var guidedResults: [RoutePath: [Result<ReportReading, ReadFailure>]] = [:]
    var permissiveResults: [Result<String, ReadFailure>] = []
    var duringOnDeviceCall: (() -> Void)?
    private(set) var calls: [Call] = []
    /// The text each call was handed, as a model would receive it.
    private(set) var texts: [String] = []

    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        calls.append(.guided(path))
        texts.append(text)
        if path == .onDevice { duringOnDeviceCall?() }
        guard var list = guidedResults[path], !list.isEmpty else { return .failure(.other) }
        let r = list.removeFirst(); guidedResults[path] = list; return r
    }

    func permissive(_ text: String) async -> Result<String, ReadFailure> {
        calls.append(.permissive)
        texts.append(text)
        guard !permissiveResults.isEmpty else { return .failure(.other) }
        return permissiveResults.removeFirst()
    }
}

private let report = "Team two cleared segment AC, coverage point eight, nothing found"
private func okReading(_ ids: [String] = ["AC"]) -> ReportReading {
    reading(segmentIds: ids, coverage: 0.8, evidenceQuote: "cleared segment AC")
}
private let languageScreen = try? LanguageScreen(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/language-words.json")))
private func rctx(online: Bool = true, onDevice: Bool = true, consent: Bool = true, kill: Bool = false, mode: String? = "drill") -> ReadContext {
    var c = ReadContext(incidentMode: mode, knownSegmentIds: ["AA", "AB", "AC", "AD"], networkOnline: online,
                        onDevice: OnDeviceStatus(available: onDevice, localeSupported: true, contextSize: 4096, variant: "AFM 3 Core Advanced"),
                        estimatedTokens: 400, tokenBudgetFraction: 0.5, cloudConsent: consent, killCloud: kill,
                        cloudModel: "gemini-3.5-flash-lite", screen: EvidenceScreen(terms: ["blood"]))
    c.language = languageScreen
    return c
}
private var clock: FixedClock { FixedClock(ms: [1_000, 1_850]) }      // one per test: tests run in parallel

@Suite struct ReadOrchestratorTests {
    /// A phone number is removed before the report reaches any model: each route's model gets
    /// exactly the scrubbed text, on the phone (guided, then permissive) and in the cloud.
    @Test func everyRouteHandsItsModelExactlyTheScrubbedText() async {
        let text = "Team two cleared segment AC, caller at 404 five five five 0123, nothing found"
        let scrubbed = "Team two cleared segment AC, caller at [number removed], nothing found"
        let onPhone = FakeRunner()
        onPhone.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        onPhone.permissiveResults = [.failure(.guardrailBlock)]
        _ = await ReadOrchestrator.read(text: text, context: rctx(online: false), runner: onPhone, clock: clock)
        #expect(onPhone.calls == [.guided(.onDevice), .permissive] && onPhone.texts == [scrubbed, scrubbed])
        let inCloud = FakeRunner()
        inCloud.guidedResults[.cloud] = [.success(okReading())]
        _ = await ReadOrchestrator.read(text: text, context: rctx(online: true, onDevice: false), runner: inCloud, clock: clock)
        #expect(inCloud.calls == [.guided(.cloud)] && inCloud.texts == [scrubbed])
    }

    @Test func onDeviceGuidedReadingIsUsedWhenValid() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(o.route.path == .onDevice)
        #expect(o.route.stage == .guided)
        #expect(o.route.reason == .noNetwork)
        #expect(o.route.model == "AFM 3 Core Advanced")
        #expect(o.route.sdkReported == false)
        #expect(o.route.latencyMs == 850)
        #expect(r.calls == [.guided(.onDevice)])
    }

    @Test func aBlockedReportStaysOnDeviceAndNeverReachesTheCloud() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        r.permissiveResults = [.failure(.guardrailBlock)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .permissive])
        #expect(o.route.stage == .deterministicParser)
        #expect(o.route.blocked == .guardrail)
        #expect(o.reading.coverage == 0.8)                 // the parser read it
    }

    @Test func permissiveLineFillsKindSegmentsAndCoverage() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.refusal)]
        r.permissiveResults = [.success("KIND: cleared, SEGMENTS: AC, COVERAGE: 0.6")]
        let o = await ReadOrchestrator.read(text: "we cleared AC, about sixty percent", context: rctx(), runner: r, clock: clock)
        #expect(o.route.stage == .permissiveText)
        #expect(o.route.blocked == .refusal)
        #expect(o.reading.kind == .cleared)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(o.reading.coverage == 0.6)
    }

    @Test func anInvalidModelReadingFallsToTheParser() async {
        // The model's segment ids are ignored (they come from the text), so the invalid field is coverage.
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 400, evidenceQuote: "cleared segment AC"))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(o.route.stage == .deterministicParser)
        #expect(o.reading.coverage == 0.8)
        #expect(o.reading.segmentIds == ["AC"])
        #expect(r.calls == [.guided(.onDevice)])
    }

    @Test func aModelThatIsNotReadyReroutesToTheCloudWhenAllowed() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.unavailable)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .guided(.cloud)])
        #expect(o.route.path == .cloud)
        #expect(o.route.reason == .onDeviceUnavailable)
        #expect(o.route.model == "gemini-3.5-flash-lite")
    }

    /// A note that does not look English never goes to the cloud read: the router's cloud route reads
    /// by rules, saying why, and the person picks instead. Apple's model and English notes are untouched.
    @Test func aNoteThatIsNotEnglishNeverGoesToTheCloud() async {
        let spanish = "Vi a una señora mayor con un abrigo azul caminando hacia el río hace diez minutos."
        let r = FakeRunner(); r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: spanish, context: rctx(onDevice: false), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.path == .rules && o.route.stage == .deterministicParser && o.route.reason == .notEnglish)
    }

    /// The screen judges the note as written as well as without its phone number: removing a number
    /// adds the English words "number removed", which must not carry a note over the line.
    @Test func aRemovedPhoneNumberNeverMakesANoteLookEnglish() async {
        for note in ["Бабушка ушла 404-555-0142", "奶奶的電話是 一二三四五六七"] {
            let r = FakeRunner(); r.guidedResults[.cloud] = [.success(okReading())]
            let o = await ReadOrchestrator.read(text: note, context: rctx(onDevice: false), runner: r, clock: clock)
            #expect(r.calls.isEmpty, "\(note)")
            #expect(o.route.reason == .notEnglish, "\(note)")
        }
    }

    @Test func aNoteThatIsNotEnglishIsNotSentToTheCloudAfterTheOnDeviceModelFails() async {
        let spanish = "Vi a una señora mayor con un abrigo azul caminando hacia el río hace diez minutos."
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.unavailable)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: spanish, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)])
        #expect(o.route.path == .rules && o.route.reason == .notEnglish)
    }

    @Test func aNoteThatIsNotEnglishStillReadsOnThisPhone() async {
        let spanish = "Vi a una señora mayor con un abrigo azul caminando hacia el río en AC hace diez minutos."
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "abrigo azul"))]
        let o = await ReadOrchestrator.read(text: spanish, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)] && o.route.path == .onDevice)
    }

    @Test func anEnglishNoteQuotingSpanishStillGoesToTheCloud() async {
        let r = FakeRunner(); r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: "Cleared segment AC, nothing found; the family calls her Abuela Rosa.",
                                            context: rctx(onDevice: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.cloud)] && o.route.path == .cloud)
    }

    /// Why each model stage was not used is kept with the read, so a route check on a real phone can
    /// say it: an answer the validator rejected, a stage that ran out of time, a line that could not be read.
    @Test func aRejectedModelAnswerIsRecordedWithItsReason() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "Clothing last worn: blue coat.")), .success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "Clothing last worn: blue coat."))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules)
        #expect(o.stageNotes == Array(repeating: "guided on_device: invalid quote_not_in_text (quote: \"Clothing last worn: blue coat.\")", count: 2))
    }

    /// After a guardrail block the phone's second, plain-text stage runs; a line it cannot read is recorded.
    @Test func anUnreadablePermissiveLineIsRecorded() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]
        r.permissiveResults = [.success("no idea")]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.stageNotes == ["guided on_device: guardrail_block", "permissive on_device: unparsed"])
    }

    @Test func aStageThatRunsOutOfTimeIsRecorded() async {
        struct Slow: ReadModelRunner {
            func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
                try? await Task.sleep(for: .seconds(5))
                return .failure(.other)
            }
            func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.unavailable) }
        }
        var c = rctx(online: false)
        c.stageTimeoutSeconds = 0.05
        let o = await ReadOrchestrator.read(text: report, context: c, runner: Slow(), clock: clock)
        #expect(o.stageNotes == ["guided on_device: timed out after 0.05 s"])
    }

    @Test func aReadTheModelAnswersHasNoNotes() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(o.route.path == .onDevice && o.stageNotes.isEmpty)
    }

    /// Apple's model reads the report alone, so its matchesProfile is not used: code decides it from the
    /// description. The cloud's answer is kept as it is.
    @Test func onThePhoneCodeDecidesWhetherAReportMatchesTheSubject() async {
        var c = rctx()
        c.profile = ModelProfile(shared: .object(["clothingLastWorn": .string("blue coat")]))
        var answer = okReading()
        answer.topColor = .blue
        answer.matchesProfile = .inconsistent
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(answer)]
        let o = await ReadOrchestrator.read(text: report, context: c, runner: r, clock: clock)
        #expect(o.route.path == .onDevice && o.reading.matchesProfile == .consistent)
        let cloud = FakeRunner(); cloud.guidedResults[.cloud] = [.success(answer)]
        let oc = await ReadOrchestrator.read(text: report, context: { var x = c; x.onDevice.available = false; return x }(), runner: cloud, clock: clock)
        #expect(oc.route.path == .cloud && oc.reading.matchesProfile == .inconsistent)
    }

    /// A model that quotes the subject's description instead of the report is rejected, and the read
    /// says why (the validator is unchanged).
    @Test func anAnswerQuotingTheSubjectsDescriptionIsRejected() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "Clothing last worn: blue coat.")), .success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "Clothing last worn: blue coat."))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules && o.stageNotes.count == 2 && o.stageNotes.allSatisfy { $0.hasPrefix("guided on_device: invalid quote_not_in_text") })
    }

    /// Apple's model fills a number the report never stated with 0. For minutes, searchers and detection
    /// range 0 is never a valid value, so it is read as not stated before validation; the validator is unchanged.
    @Test func aZeroFromApplesModelMeansNotStated() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(coverage: 0.8, minutes: 0, searchers: 0, detectionRangeM: 0))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .onDevice && o.route.stage == .guided && o.stageNotes.isEmpty)
        #expect(o.reading.minutes == nil && o.reading.searchers == nil && o.reading.detectionRangeM == nil)
        #expect(o.reading.coverage == 0.8)
    }

    /// Only a zero is read as not stated: any other out-of-range number from Apple's model is still rejected.
    @Test func otherBadNumbersFromApplesModelAreStillRejected() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(coverage: 0.8, minutes: -5))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules && o.stageNotes == ["guided on_device: invalid minutes_out_of_range"])
    }

    /// The cloud model's zeros are not changed: it is not the one that fills unstated numbers with 0.
    @Test func aZeroFromTheCloudModelIsStillRejected() async {
        let r = FakeRunner()
        r.guidedResults[.cloud] = [.success(reading(coverage: 0.8, minutes: 0))]
        let o = await ReadOrchestrator.read(text: report, context: rctx(onDevice: false), runner: r, clock: clock)
        #expect(o.stageNotes.first == "guided cloud: invalid minutes_out_of_range")
    }

    /// A quote of a tool's text is not the report's words, so it stays rejected however the tool text reached the model.
    @Test func aQuoteOfToolTextStaysRejected() async {
        let r = FakeRunner()
        let toolQuote = reading(kind: .unclear, segmentIds: [], evidenceQuote: ToolText.segmentHere(nil))
        r.guidedResults[.onDevice] = [.success(toolQuote), .success(toolQuote)]
        let o = await ReadOrchestrator.read(text: "Not sure where we are, the radio is weak", context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules)
        #expect(o.stageNotes.allSatisfy { $0.hasPrefix("guided on_device: invalid quote_not_in_text") } && !o.stageNotes.isEmpty)
    }

    /// Apple's model can add a period to its quote. At most one trailing . , ! or ? is dropped, and only when
    /// what is left is the report's own words; the validator is unchanged.
    @Test func aQuoteWithAnAddedPeriodIsAccepted() async {
        let r = FakeRunner()
        let text = "Found a shoe on the path in segment AC"
        r.guidedResults[.onDevice] = [.success(reading(kind: .clue, evidenceQuote: "Found a shoe on the path in segment AC."))]
        let o = await ReadOrchestrator.read(text: text, context: rctx(online: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)] && o.route.path == .onDevice && o.stageNotes.isEmpty)
        #expect(o.reading.evidenceQuote == "Found a shoe on the path in segment AC")
    }

    @Test(arguments: [",", "!", "?"]) func eachTrailingMarkCanBeDropped(_ mark: String) async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(evidenceQuote: "Team two cleared segment AC" + mark))]
        let o = await ReadOrchestrator.read(text: "Team two cleared segment AC nothing found", context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .onDevice && o.reading.evidenceQuote == "Team two cleared segment AC")
    }

    @Test func aQuoteNotInTheReportAfterDroppingTheMarkStaysRejected() async {
        let r = FakeRunner()
        let wrong = reading(kind: .clue, evidenceQuote: "Found a boot on the path.")
        r.guidedResults[.onDevice] = [.success(wrong), .success(wrong)]
        let o = await ReadOrchestrator.read(text: "Found a shoe on the path in segment AC", context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules && !o.stageNotes.isEmpty)
        #expect(o.stageNotes.allSatisfy { $0.hasPrefix("guided on_device: invalid quote_not_in_text") })
    }

    @Test func onlyOneTrailingMarkIsDropped() async {
        let r = FakeRunner()
        let two = reading(kind: .clue, evidenceQuote: "Found a shoe on the path in segment AC..")
        r.guidedResults[.onDevice] = [.success(two), .success(two)]
        let o = await ReadOrchestrator.read(text: "Found a shoe on the path in segment AC", context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .rules)
    }

    @Test func aReportWithThePeriodKeepsItInTheQuote() async {
        let r = FakeRunner()
        let text = "Found a shoe on the path in segment AC."
        r.guidedResults[.onDevice] = [.success(reading(kind: .clue, evidenceQuote: text))]
        let o = await ReadOrchestrator.read(text: text, context: rctx(online: false), runner: r, clock: clock)
        #expect(o.route.path == .onDevice && o.reading.evidenceQuote == text)
    }

    /// A read cut off by the response cap falls to rules with a note that says so.
    @Test func aCappedReadFallsToRulesWithANote() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.emptyResponse)]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)] && o.route.path == .rules)
        #expect(o.stageNotes == ["guided on_device: empty_response"])
    }

    /// Apple's model sometimes leaves the quote empty. A read rejected only for its quote is asked once
    /// more; the validator is unchanged, so two rejections still fall to rules.
    @Test func anEmptyQuoteIsAskedOnceMoreThenAccepted() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "")), .success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .guided(.onDevice)])
        #expect(o.route.path == .onDevice && o.route.stage == .guided)
        #expect(o.stageNotes == ["guided on_device: invalid quote_not_in_text (quote empty)"])
    }

    @Test func twoEmptyQuotesFallToRules() async {
        let r = FakeRunner()
        let empty = reading(segmentIds: ["AC"], coverage: 0.8, evidenceQuote: "")
        r.guidedResults[.onDevice] = [.success(empty), .success(empty), .success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .guided(.onDevice)])
        #expect(o.route.path == .rules)
        #expect(o.stageNotes == Array(repeating: "guided on_device: invalid quote_not_in_text (quote empty)", count: 2))
    }

    /// Only a rejected quote gets the second try: any other invalid answer goes straight on.
    @Test func otherInvalidAnswersAreNotAskedAgain() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.success(reading(segmentIds: ["AC"], coverage: 400, evidenceQuote: "cleared segment AC")), .success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(online: false), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)] && o.route.path == .rules)
    }

    @Test func noConsentMeansRulesNotCloud() async {
        let r = FakeRunner()
        let o = await ReadOrchestrator.read(text: report, context: rctx(onDevice: false, consent: false), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.path == .rules)
        #expect(o.route.stage == .deterministicParser)
    }

    @Test func evidenceTextCallsNoModelAtAll() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: "there is blood on a rock in AC", context: rctx(), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.stage == .evidenceProtocol)
        #expect(o.route.reason == .possibleEvidence)
        #expect(o.route.model == "none")
    }

    @Test func outsideADrillNoModelIsCalled() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(mode: "live"), runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.reason == .notDrillMode)
    }

    @Test func anUnreadableReportEndsAtThePickList() async {
        let r = FakeRunner(); r.guidedResults[.onDevice] = [.failure(.guardrailBlock)]; r.permissiveResults = [.success("no idea")]
        let o = await ReadOrchestrator.read(text: "hmm", context: rctx(), runner: r, clock: clock)
        #expect(o.reading.kind == .unclear)
        #expect(o.route.stage == .deterministicParser)
        #expect(o.needsPickList)
    }
}

@Suite struct PermissiveLineTests {
    @Test func pipeAndLabelledFormsBothParse() {
        #expect(PermissiveLine.parse("cleared|AC|0.8", known: ["AC"]) == PermissiveLine(kind: .cleared, segmentIds: ["AC"], coverage: 0.8))
        #expect(PermissiveLine.parse("KIND: found, SEGMENTS: AB, COVERAGE: none", known: ["AB"]) == PermissiveLine(kind: .found, segmentIds: ["AB"], coverage: nil))
    }

    @Test func unknownKindsAndIdsAreRefused() {
        #expect(PermissiveLine.parse("KIND: teleported, SEGMENTS: AB", known: ["AB"]) == nil)
        #expect(PermissiveLine.parse("KIND: clue, SEGMENTS: subject injured by the creek in ZZ, COVERAGE: creek", known: ["AB"]) == PermissiveLine(kind: .clue, segmentIds: [], coverage: nil))
    }
}

/// The cloud gate as it is right now; the test flips it while the on-device call runs.
final class LiveGateBox: @unchecked Sendable {
    var gate: LiveGate
    init(_ gate: LiveGate) { self.gate = gate }
}

@Suite struct ReadOrchestratorLiveGateTests {
    func context(_ box: LiveGateBox) -> ReadContext {
        var c = rctx()
        c.liveGate = { box.gate }
        return c
    }

    @Test func aKillSwitchFlippedDuringTheOnDeviceCallKeepsTheReportOffTheCloud() async {
        let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: true, killCloud: false, incidentMode: "drill"))
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.unavailable)]
        r.guidedResults[.cloud] = [.success(okReading())]
        r.duringOnDeviceCall = { box.gate.killCloud = true }
        let o = await ReadOrchestrator.read(text: report, context: context(box), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)])
        #expect(o.route.path == .rules)
    }

    @Test func lostSignalOrWithdrawnConsentAlsoKeepItOff() async {
        for flip in [{ (g: inout LiveGate) in g.networkOnline = false }, { (g: inout LiveGate) in g.cloudConsent = false }] {
            let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: true, killCloud: false, incidentMode: "drill"))
            let r = FakeRunner()
            r.guidedResults[.onDevice] = [.failure(.unavailable)]
            r.guidedResults[.cloud] = [.success(okReading())]
            r.duringOnDeviceCall = { flip(&box.gate) }
            _ = await ReadOrchestrator.read(text: report, context: context(box), runner: r, clock: clock)
            #expect(r.calls == [.guided(.onDevice)])
        }
    }

    @Test func aCloudRouteChosenFromTheSnapshotIsCheckedAgainAtDispatch() async {
        let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: true, killCloud: true, incidentMode: "drill"))
        var c = context(box)
        c.onDevice.available = false                                      // the snapshot says: cloud
        let r = FakeRunner(); r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: c, runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.path == .rules)
    }

    @Test func aCloudRouteClosedByAModeChangeBeforeDispatchSaysSo() async {
        let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: true, killCloud: false, incidentMode: "closed"))
        var c = context(box)
        c.onDevice.available = false
        let r = FakeRunner(); r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: c, runner: r, clock: clock)
        #expect(r.calls.isEmpty)
        #expect(o.route.reason == .notDrillMode)
    }

    @Test func anIncidentThatLeftDrillModeIsRecordedAsSuch() async {
        let box = LiveGateBox(LiveGate(networkOnline: true, cloudConsent: true, killCloud: false, incidentMode: "drill"))
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.unavailable)]
        r.guidedResults[.cloud] = [.success(okReading())]
        r.duringOnDeviceCall = { box.gate.incidentMode = "closed" }
        let o = await ReadOrchestrator.read(text: report, context: context(box), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice)])
        #expect(o.route.reason == .notDrillMode)
    }

    @Test func aContextLimitKeepsItsOwnReasonOnTheCloud() async {
        let r = FakeRunner()
        r.guidedResults[.onDevice] = [.failure(.contextExceeded)]
        r.guidedResults[.cloud] = [.success(okReading())]
        let o = await ReadOrchestrator.read(text: report, context: rctx(), runner: r, clock: clock)
        #expect(r.calls == [.guided(.onDevice), .guided(.cloud)])
        #expect(o.route.reason == .overTokenBudget)
    }
}

/// A runner whose guided call takes far longer than any stage limit.
final class SlowRunner: ReadModelRunner, @unchecked Sendable {
    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        try? await Task.sleep(for: .seconds(30))
        return .failure(.other)
    }
    func permissive(_ text: String) async -> Result<String, ReadFailure> {
        try? await Task.sleep(for: .seconds(30))
        return .failure(.other)
    }
}

@Suite struct ReadOrchestratorTimeoutTests {
    @Test func aModelStageThatTakesTooLongFallsToTheParser() async {
        var c = rctx()
        c.stageTimeoutSeconds = 0.2
        let start = Date()
        let o = await ReadOrchestrator.read(text: report, context: c, runner: SlowRunner(), clock: SystemClock())
        #expect(Date().timeIntervalSince(start) < 5)
        #expect(o.route.stage == .deterministicParser)
        #expect(o.reading.coverage == 0.8)
    }
}

@Suite struct ReadOrchestratorTransportTests {
    @Test func aCloudNetworkFailureIsReportedSoConnectivityCanLearnFromIt() async {
        let r = FakeRunner(); r.guidedResults[.cloud] = [.failure(.network)]
        let o = await ReadOrchestrator.read(text: report, context: rctx(onDevice: false), runner: r, clock: clock)
        #expect(o.cloudTransport == .failed)
        #expect(o.route.stage == .deterministicParser)
    }

    @Test func aCloudSuccessAndAnOnDeviceReadReportWhatHappened() async {
        let ok = FakeRunner(); ok.guidedResults[.cloud] = [.success(okReading())]
        #expect(await ReadOrchestrator.read(text: report, context: rctx(onDevice: false), runner: ok, clock: clock).cloudTransport == .succeeded)
        let local = FakeRunner(); local.guidedResults[.onDevice] = [.success(okReading())]
        #expect(await ReadOrchestrator.read(text: report, context: rctx(), runner: local, clock: clock).cloudTransport == .notUsed)
    }
}

