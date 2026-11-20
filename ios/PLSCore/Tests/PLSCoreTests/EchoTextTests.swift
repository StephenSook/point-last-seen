import Foundation
import Testing
@testable import PLSCore

@Suite struct EchoTextTests {
    @Test func aClearShowsCoverageAndPOD() {
        let e = Effect.cleared(segmentId: "AC", pod: 1 - exp(-0.8), inputs: ClearedInputs(coverage: 0.8, sweepWidthM: nil, trackLengthM: nil, areaM2: 15_625, rdBasis: .openTarget))
        #expect(EchoText.effectLine(e) == "Cleared AC. Coverage 0.8. POD 55%.")
        let f = Effect.cleared(segmentId: "AB", pod: 1 - exp(-0.5196555), inputs: ClearedInputs(coverage: 0.5196555, sweepWidthM: 16.45, trackLengthM: 3159, areaM2: 100_000, rdBasis: .openTarget))
        #expect(EchoText.effectLine(f) == "Cleared AB. Coverage 0.52. POD 41%.")
    }

    @Test func noneReasonsSayWhatToDo() {
        #expect(EchoText.effectLine(.none(why: .soundOnly)) == "Calling alone is not counted for this person.")
        #expect(EchoText.effectLine(.none(why: .needsCommand)) == "Ask command.")
        #expect(EchoText.effectLine(.none(why: .invalid)) == "Could not read this report. Ask command.")
        #expect(EchoText.effectLine(.none(why: .outsideArea)) == "Outside the search area. Ask command.")
        #expect(EchoText.effectLine(.clue(influences: ["AC": .strongFor, "AD": .for], authenticity: .medium)) == "Clue logged in AC.")
        #expect(EchoText.asksCommand(.none(why: .needsCommand)))
        #expect(EchoText.asksCommand(.cleared(segmentId: "AC", pod: 0.5, inputs: ClearedInputs(coverage: 0.69, sweepWidthM: nil, trackLengthM: nil, areaM2: 1, rdBasis: .default))) == false)
    }

    @Test func deliveryBadges() {
        #expect(EchoText.deliveryLine(.pending) == "On this phone only")
        #expect(EchoText.deliveryLine(.checking) == "Checking delivery")
        #expect(EchoText.deliveryLine(.acked) == "Delivered")
        #expect(EchoText.deliveryLine(.rejected(reason: "permission-denied")) == "Not delivered. Retry")
        #expect(EchoText.deliveryLine(.rejected(reason: Outbox.conflictReason)) == "Not delivered. Ask command")
    }

    @Test func routeLinesNeverClaimTheSDKReportedIt() {
        let on = RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "AFM 3 Core Advanced", reason: .noNetwork, latencyMs: 900, sdkReported: false, blocked: nil, decidedAtMs: 0)
        #expect(EchoText.routeLine(on) == "Suggested by Apple's on-device model on this iPhone")
        var cloud = on; cloud.path = .cloud; cloud.model = "gemini-3.5-flash-lite"
        #expect(EchoText.routeLine(cloud) == "Suggested by Gemini in the cloud")
        var rules = on; rules.path = .rules; rules.stage = .deterministicParser; rules.blocked = .guardrail
        #expect(EchoText.routeLine(rules) == "Read by rules, not a model (the model declined)")
        var ev = rules; ev.stage = .evidenceProtocol; ev.blocked = nil
        #expect(EchoText.routeLine(ev) == "Not sent to any model.")
    }

    @Test func aSightingIsNamedAsOneAndWaitsForCommand() {
        let effect = Effect.clue(influences: ["AC": .strongFor], authenticity: .medium)
        #expect(EchoText.effectLine(effect, type: .sighting) == "Sighting logged in AC. It counts once command confirms it.")
        #expect(EchoText.effectLine(effect, type: .clue) == "Clue logged in AC.")
    }

    /// In the practice drill there is no command to ask: the line says what to do in a real search.
    /// Every other line, and every real report's line, stays as it is.
    @Test func practiceReportsSayAskCommandOnlyForARealSearch() {
        #expect(EchoText.effectLine(.none(why: .needsCommand), type: .clue, practice: true) == "In a real search, ask command.")
        #expect(EchoText.effectLine(.none(why: .invalid), type: .clue, practice: true)
            == "Could not read this report. In a real search, ask command.")
        #expect(EchoText.effectLine(.none(why: .outsideArea), type: .clue, practice: true)
            == "Outside the search area. In a real search, ask command.")
        #expect(EchoText.effectLine(.none(why: .soundOnly), type: .clue, practice: true) == "Calling alone is not counted for this person.")
        #expect(EchoText.effectLine(.none(why: .needsCommand), type: .clue, practice: false) == "Ask command.")
    }

    /// A note the language screen kept off the cloud says so under the report, and names the hand path.
    @Test func aNoteKeptOffTheCloudForItsLanguageSaysSo() {
        func route(_ reason: RouteReason) -> RouteRecord {
            RouteRecord(platform: .ios, path: .rules, stage: .deterministicParser, model: "rules", reason: reason,
                        latencyMs: 1, sdkReported: false, blocked: nil, decidedAtMs: 0)
        }
        #expect(EchoText.refusalLine(route(.notEnglish)) == "This note doesn't look like English, so it stays on this phone. Pick instead of typing.")
        #expect(EchoText.refusalLine(route(.onDeviceUnavailable)) == nil)
    }
}
