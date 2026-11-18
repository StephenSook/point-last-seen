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
}
