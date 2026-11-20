import Foundation
import PLSCore
import Testing
@testable import PLS

/// The eval reads each report with the app's own reader, forced to one arm: rules only, or Apple's
/// on-device model. Neither arm may reach the cloud: no network, no cloud consent.
@MainActor
@Suite struct EvalReadTests {
    final class Seen: @unchecked Sendable { var situations: [ReportSituation] = [] }

    func model(_ seen: Seen, blocked: BlockKind? = nil) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, readReport: { text, situation, _, _ in
            seen.situations.append(situation)
            let path: RoutePath = situation.incidentMode == nil ? .rules : .onDevice
            let route = RouteRecord(platform: .ios, path: path, stage: path == .rules ? .deterministicParser : .guided,
                                    model: path == .rules ? "rules" : "apple", reason: .onDeviceDefault, latencyMs: 812,
                                    sdkReported: false, blocked: blocked, decidedAtMs: 0)
            return ReadOutcome(reading: ReportReading.unclear(quote: text), route: route, validation: .ok)
        })
    }

    func mission() throws -> Mission {
        Mission(incidentId: "drill-test-1", mode: "drill", teamId: "T1", priorVersion: 2,
                grid: [], prior: [], assignedSegmentIds: ["BO"], params: try BundledConstants.engineParams(),
                profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
    }

    @Test func theRulesArmReadsWithNoModelAndNoNetwork() async throws {
        let seen = Seen()
        let m = model(seen)
        await m.load(try mission())
        let out = try #require(await m.evalRead("Cleared BO.", arm: .rulesOnly))
        let s = try #require(seen.situations.first)
        #expect(s.incidentMode == nil && !s.networkOnline && !s.cloudConsent && s.liveGate == nil)
        #expect(s.assignedSegmentIds == ["BO"])
        #expect(out.path == "rules/deterministic_parser" && out.latencyMs == 812 && !out.blocked)
        #expect(out.reading?.evidenceQuote == "Cleared BO.")
    }

    @Test func theOnDeviceArmReadsInTheMissionsModeWithNoNetworkAndNoCloud() async throws {
        let seen = Seen()
        let m = model(seen)
        await m.load(try mission())
        let out = try #require(await m.evalRead("Cleared BO.", arm: .onDevice))
        let s = try #require(seen.situations.first)
        #expect(s.incidentMode == "drill" && !s.networkOnline && !s.cloudConsent && s.liveGate == nil)
        #expect(out.path == "on_device/guided")
    }

    @Test func aRefusedReadIsBlockedAndNoMissionReadsNothing() async throws {
        let seen = Seen()
        let m = model(seen, blocked: .guardrail)
        #expect(await m.evalRead("Cleared BO.", arm: .onDevice) == nil)
        await m.load(try mission())
        #expect(await m.evalRead("Cleared BO.", arm: .onDevice)?.blocked == true)
    }
}
