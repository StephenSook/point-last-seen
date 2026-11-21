import Foundation
import Testing
@testable import PLSCore

private let raw = "cleared segment AC"
private let fix = Position(lat: inside("AC").lat, lon: inside("AC").lon, accuracyM: 6)
private let screen = EvidenceScreen(terms: ["blood", "weapon"])

private func route() -> RouteRecord {
    RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "apple-system", reason: .noNetwork, latencyMs: 900, sdkReported: false, blocked: nil, decidedAtMs: 5)
}
private func outcome(segmentIds: [String] = ["AC"], coverage: Double? = 1.0, kind: ReportKind = .cleared) -> ReadOutcome {
    ReadOutcome(reading: reading(kind: kind, segmentIds: segmentIds, coverage: coverage, evidenceQuote: "cleared segment AC"), route: route(), validation: .ok)
}
private func clearedOutcome(segmentIds: [String], coverage: Double = 1.0) -> ReadOutcome { outcome(segmentIds: segmentIds, coverage: coverage) }
private func ctxAssigned(_ assigned: [String]) -> OutcomeContext { outcomeCtx(assigned: assigned) }
private func outcomeCtx(assigned: [String] = ["AC"]) -> OutcomeContext {
    OutcomeContext(incidentId: "I1", teamId: "T1", deviceId: "D1", authorUid: "u1", priorVersion: 1, clientTimeMs: 1_700_000_000_000,
                   inputMethod: .typed, isTrainingInject: false,
                   grid: grid,
                   effect: EffectContext(grid: grid, assignedSegmentIds: assigned, position: nil, visualDetectionRangeM: 10, rdBasis: .openTarget),
                   params: params)
}

@Suite struct ReadOutcomeTests {
    @Test func readOutcomeWithoutFixUsesAssignment() {
        let e = ReadOutcomeBuilder.event(from: clearedOutcome(segmentIds: []), rawText: raw, position: nil, context: ctxAssigned(["AC"]), seq: 7)
        #expect(e.positionSource == .assignedSegment)
        #expect(e.effect.clearedSegmentId == "AC")
        #expect(e.eventId == EventID.make(incidentId: "I1", deviceId: "D1", seq: 7))
        #expect(e.seq == 7)
    }

    @Test func percentCoverageIsNormalizedInTheStoredEffect() {
        let e = ReadOutcomeBuilder.event(from: clearedOutcome(segmentIds: ["AC"], coverage: 80), rawText: raw, position: fix, context: outcomeCtx(), seq: 8)
        #expect(e.effect.pod.map { abs($0 - 0.5506710358827784) < 1e-12 } == true)       // 1 - e^-0.8
        #expect(e.positionSource == .gps)
        #expect(e.reading?["coverage"] == .number(0.8))
    }

    @Test func invalidReadingGivesNoEffect() {
        // The model's own ids are ignored (segments come from the text), so the unknown id is in the report.
        #expect(ReadOutcomeBuilder.event(from: outcome(segmentIds: ["ZZ"]), rawText: "cleared segment ZZ", position: fix, context: outcomeCtx(), seq: 9).effect == .none(why: .invalid))
        #expect(ReadOutcomeBuilder.event(from: outcome(coverage: 400), rawText: raw, position: fix, context: outcomeCtx(), seq: 10).effect == .none(why: .invalid))
    }

    @Test func kindsMapToEventTypes() {
        #expect(ReadOutcomeBuilder.event(from: outcome(kind: .clue), rawText: raw, position: fix, context: outcomeCtx(), seq: 1).type == .clue)
        let s = ReadOutcomeBuilder.event(from: outcome(kind: .sighting), rawText: raw, position: fix, context: outcomeCtx(), seq: 2)
        #expect(s.type == .sighting)
        #expect(s.effect == .clue(influences: ["AC": .strongFor], authenticity: .medium))
        #expect(ReadOutcomeBuilder.event(from: outcome(kind: .found), rawText: raw, position: fix, context: outcomeCtx(), seq: 3).effect == .none(why: .informational))
        let u = ReadOutcomeBuilder.event(from: outcome(kind: .unclear), rawText: raw, position: fix, context: outcomeCtx(), seq: 4)
        #expect(u.type == .clue)
        #expect(u.effect == .none(why: .needsCommand))
    }

    @Test func theEventCarriesTheRouteTextAndIdentity() {
        let e = ReadOutcomeBuilder.event(from: outcome(), rawText: raw, position: fix, context: outcomeCtx(), seq: 11)
        #expect(e.route == route())
        #expect(e.rawText == raw)
        #expect(e.role == .searcher)
        #expect(e.reporter == .searcher)
        #expect(e.authorUid == "u1")
        #expect(e.priorVersion == 1)
        #expect(e.schemaVersion == 1)
    }

    @Test func phoneNumbersAreRemovedFromStoredText() {
        let e = ReadOutcomeBuilder.event(from: outcome(), rawText: "cleared segment AC, call me at 404-555-0123", position: fix, context: outcomeCtx(), seq: 12)
        #expect(e.rawText == "cleared segment AC, call me at [number removed]")
    }

    @Test func evidenceTextNeverReachesAModel() {
        let plan = ReadPlan.make(text: "there is blood on a rock by the creek", decision: .init(path: .onDevice, reason: .onDeviceDefault), screen: screen, incidentMode: "drill")
        #expect(plan.stages == [.evidenceProtocol])
        #expect(plan.callsModel == false)
        #expect(plan.decision == RouteDecision(path: .rules, reason: .possibleEvidence))
    }

    @Test func readPlansFollowTheRoute() {
        let onDevice = ReadPlan.make(text: raw, decision: .init(path: .onDevice, reason: .noNetwork), screen: screen, incidentMode: "drill")
        #expect(onDevice.stages == [.guided, .permissiveText, .deterministicParser])
        #expect(onDevice.callsModel)
        #expect(ReadPlan.make(text: raw, decision: .init(path: .cloud, reason: .onDeviceUnavailable), screen: screen, incidentMode: "judge").stages == [.guided, .deterministicParser])
        let rules = ReadPlan.make(text: raw, decision: .init(path: .rules, reason: .onDeviceUnavailable), screen: screen, incidentMode: "drill")
        #expect(rules.stages == [.deterministicParser])
        #expect(rules.callsModel == false)
    }

    @Test func emptyOrOverlongTextCallsNoModel() {
        #expect(ReadPlan.make(text: "  ", decision: .init(path: .onDevice, reason: .onDeviceDefault), screen: screen, incidentMode: "drill").callsModel == false)
        #expect(ReadPlan.make(text: String(repeating: "a", count: 2000), decision: .init(path: .cloud, reason: .onDeviceUnavailable), screen: screen, incidentMode: "judge").callsModel == false)
    }

    @Test func noModelIsCalledOutsideADrillOrJudgeIncident() {
        for mode in [nil, "", "live", "Drill"] as [String?] {
            let plan = ReadPlan.make(text: raw, decision: .init(path: .onDevice, reason: .onDeviceDefault), screen: screen, incidentMode: mode)
            #expect(plan.callsModel == false)
            #expect(plan.decision == RouteDecision(path: .rules, reason: .notDrillMode))
        }
    }

    @Test func evidenceProtocolOutcomeIsLoggedAsPlainTextForCommand() {
        let r = RouteRecord(platform: .ios, path: .rules, stage: .evidenceProtocol, model: "none", reason: .possibleEvidence, latencyMs: 1, sdkReported: false, blocked: nil, decidedAtMs: 1)
        let e = ReadOutcomeBuilder.event(from: ReadOutcome(reading: .unclear(), route: r, validation: .ok), rawText: "blood on a rock", position: fix, context: outcomeCtx(), seq: 13)
        #expect(e.effect == .none(why: .needsCommand))
        #expect(e.reading == nil)
        #expect(e.rawText == "blood on a rock")
        #expect(e.route?.stage == .evidenceProtocol)
    }

    @Test func segmentIdsTheReportNeverNamedAreDropped() {
        // Spike S15 on the Mac: the on-device model copied every id the tool listed.
        let o = ReadOutcome(reading: reading(segmentIds: ["AA", "AB", "AC"], coverage: 0.8, evidenceQuote: "cleared segment AC"), route: route(), validation: .ok)
        let e = ReadOutcomeBuilder.event(from: o, rawText: "cleared segment AC", position: fix, context: outcomeCtx(), seq: 20)
        #expect(e.effect.clearedSegmentId == "AC")
        #expect(e.reading?["segmentIds"] == .array([.string("AC")]))
    }

    /// A photo's words are written from the model's caption, so they never pick a segment: the segment code chose stays.
    @Test func aPhotoClueKeepsTheSegmentFromCodeNotFromItsWords() {
        var ctx = outcomeCtx(assigned: ["AC"])
        ctx.inputMethod = .photo
        var r = ReportReading.unclear(quote: "grid ae cap")
        r.kind = .clue
        r.segmentIds = ["AC"]
        r.item = "grid ae cap"
        for text in ["Photo: grid ae cap.", "Photo: segment AE cap."] {
            let e = ReadOutcomeBuilder.event(from: ReadOutcome(reading: r, route: route(), validation: .ok), rawText: text, position: nil, context: ctx, seq: 30)
            #expect(e.reading?["segmentIds"] == .array([.string("AC")]), "\(text)")
        }
    }

    @Test func whenNoClaimedIdIsNamedTheAssignmentIsUsed() {
        let o = ReadOutcome(reading: reading(segmentIds: ["AA", "AB"], coverage: 1, evidenceQuote: "we cleared our area"), route: route(), validation: .ok)
        let e = ReadOutcomeBuilder.event(from: o, rawText: "we cleared our area", position: nil, context: outcomeCtx(assigned: ["AD"]), seq: 21)
        #expect(e.effect.clearedSegmentId == "AD")
        #expect(e.positionSource == .assignedSegment)
    }

    @Test func lowercaseWordsAreNotTakenAsNamedIds() {
        let o = ReadOutcome(reading: reading(segmentIds: ["AA"], coverage: 1, evidenceQuote: "cleared it at the bend"), route: route(), validation: .ok)
        #expect(ReadOutcomeBuilder.event(from: o, rawText: "cleared it at the bend", position: nil, context: outcomeCtx(assigned: ["AC"]), seq: 22).effect.clearedSegmentId == "AC")
    }

    @Test func anUnknownNamedSegmentNeverFallsBackToTheAssignment() {
        let text = "cleared segment ZZ, coverage 1"
        let parsed = ReportParser.parse(text, context: ParseContext(knownSegmentIds: ["AA", "AB", "AC", "AD"]))
        let fromParser = ReadOutcome(reading: parsed, route: route(), validation: .ok)
        #expect(ReadOutcomeBuilder.event(from: fromParser, rawText: text, position: nil, context: outcomeCtx(assigned: ["AC"]), seq: 30).effect == .none(why: .invalid))
        // A model that left the unknown id out must not get the assignment either.
        let fromModel = ReadOutcome(reading: reading(segmentIds: [], coverage: 1, evidenceQuote: "cleared segment ZZ"), route: route(), validation: .ok)
        #expect(ReadOutcomeBuilder.event(from: fromModel, rawText: text, position: nil, context: outcomeCtx(assigned: ["AC"]), seq: 31).effect == .none(why: .invalid))
    }

    @Test func aSightingRecordsWhenItWasSeenNotWhenItWasSent() {
        let saw = ReadOutcome(reading: reading(kind: .sighting, segmentIds: ["AC"], evidenceQuote: "saw her"), route: route(), validation: .ok)
        let base = outcomeCtx()
        let ago = ReadOutcomeBuilder.event(from: saw, rawText: "saw her 20 minutes ago in AC", position: fix, context: base, seq: 40)
        #expect(ago.observedAtMs == base.clientTimeMs - 20 * 60_000)
        let hour = ReadOutcomeBuilder.event(from: saw, rawText: "saw her an hour ago in AC", position: fix, context: base, seq: 41)
        #expect(hour.observedAtMs == base.clientTimeMs - 60 * 60_000)
        let unknown = ReadOutcomeBuilder.event(from: saw, rawText: "saw her in AC", position: fix, context: base, seq: 42)
        #expect(unknown.observedAtMs == nil)                                     // the app asks for the time
        var picked = base; picked.observedAtMs = 1_699_999_000_000
        #expect(ReadOutcomeBuilder.event(from: saw, rawText: "saw her 20 minutes ago in AC", position: fix, context: picked, seq: 43).observedAtMs == 1_699_999_000_000)
        #expect(ReadOutcomeBuilder.event(from: outcome(), rawText: raw, position: fix, context: base, seq: 44).observedAtMs == nil)
    }

    @Test func storedTextNeverExceedsTheRulesLimit() {
        let long = String(repeating: "a", count: 2_500)
        let e = ReadOutcomeBuilder.event(from: outcome(kind: .unclear), rawText: long, position: fix, context: outcomeCtx(), seq: 50)
        #expect((e.rawText ?? "").utf8.count <= 2_000)
        let emoji = String(repeating: "\u{1F332}", count: 700)                    // 4 bytes each
        let f = ReadOutcomeBuilder.event(from: outcome(kind: .unclear), rawText: emoji, position: fix, context: outcomeCtx(), seq: 51)
        #expect((f.rawText ?? "").utf8.count <= 2_000)
        #expect(f.rawText?.unicodeScalars.allSatisfy { $0 == "\u{1F332}" } == true)   // cut at a character boundary
        let phones = String(repeating: "call 4045550123 ", count: 120)             // the scrub makes it longer
        let g = ReadOutcomeBuilder.event(from: outcome(kind: .unclear), rawText: phones, position: fix, context: outcomeCtx(), seq: 52)
        #expect((g.rawText ?? "").utf8.count <= 2_000)
    }
}
