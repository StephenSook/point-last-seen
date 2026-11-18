import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct ReportReaderTests {
    func reader() throws -> ReportReader {
        ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen())
    }
    func situation(mode: String?) -> ReportSituation {
        ReportSituation(incidentMode: mode, knownSegmentIds: ["AA", "AB", "AC"], assignedSegmentIds: ["AC"], positionSegmentId: nil,
                        profile: ModelProfile(shared: .null), networkOnline: false, cloudConsent: false)
    }

    @Test func evidenceTextEndsAtTheProtocolWithNoModel() async throws {
        let o = await try reader().read("there is blood on a rock by the creek", situation: situation(mode: "drill"))
        #expect(o.route.stage == .evidenceProtocol)
        #expect(o.route.model == "none")
        #expect(o.route.reason == .possibleEvidence)
        #expect(o.route.platform == .ios)
        #expect(o.route.sdkReported == false)
    }

    @Test func outsideADrillTheParserReadsIt() async throws {
        let o = await try reader().read("cleared segment AC, coverage point eight", situation: situation(mode: nil))
        #expect(o.route.path == .rules)
        #expect(o.route.reason == .notDrillMode)
        #expect(o.reading.coverage == 0.8)
    }

    @Test func remoteConfigDefaultsMatchTheSpec() {
        let d = RemoteConfigValues.defaults
        #expect(d.cloudModelIOS == "gemini-3.5-flash-lite")
        #expect(d.tokenBudgetFraction == 0.5)
        #expect(d.killCloud == false)
        #expect(d.useLimitedUseTokens == true)
    }

    @Test func evidenceTextAndNonDrillTextNeverReachTheTokenCounter() async throws {
        let counter = CallCounter()
        let r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in await counter.bump(); return 100 })
        _ = await r.read("there is blood on a rock by the creek", situation: situation(mode: "drill"))
        _ = await r.read("cleared segment AC, coverage point eight", situation: situation(mode: nil))
        #expect(await counter.count == 0)
    }
}

actor CallCounter {
    private(set) var count = 0
    func bump() { count += 1 }
}

/// Answers at once with a valid reading of whatever it was given.
struct InstantRunner: ReadModelRunner {
    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        .success(ReportReading.unclear(quote: String(text.prefix(40))))
    }
    func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.other) }
}

@Suite struct ReportReaderTimeoutTests {
    @Test func aHungTokenCountDoesNotHoldTheReport() async throws {
        let r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in try? await Task.sleep(for: .seconds(60)); return 100 },
                             tokenCountTimeoutSeconds: 0.2,
                             makeRunner: { _, _, _ in InstantRunner() })
        let situation = ReportSituation(incidentMode: "drill", knownSegmentIds: ["AC"], assignedSegmentIds: ["AC"], positionSegmentId: nil,
                                        profile: ModelProfile(shared: .null), networkOnline: false, cloudConsent: false)
        let start = Date()
        _ = await r.read("we searched near the creek", situation: situation)
        #expect(Date().timeIntervalSince(start) < 10)
    }
}

