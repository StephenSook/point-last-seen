import Foundation
import Synchronization
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

    /// The release route check reads one fixed sentence on each route. With Apple's model available
    /// the router takes it; with the model turned off for the check (and signal and consent), the
    /// same sentence goes to the cloud route instead.
    @Test func theRouteCheckCanTurnTheOnDeviceModelOffForOneRead() async throws {
        final class Paths: @unchecked Sendable { let m = Mutex<[RoutePath]>([]) }
        let paths = Paths()
        struct Recording: ReadModelRunner {
            let paths: Paths
            func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
                paths.m.withLock { $0.append(path) }
                return .success(ReportReading.unclear(quote: String(text.prefix(40))))
            }
            func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.other) }
        }
        var r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in 100 })
        r.makeRunner = { _, _, _ in Recording(paths: paths) }
        r.deviceStatus = { OnDeviceStatus(available: true, localeSupported: true, contextSize: 4096, variant: "test") }
        var s = situation(mode: "drill")
        s.networkOnline = true
        s.cloudConsent = true
        let onDevice = await r.read("cleared segment AC, nothing found", situation: s)
        s.onDeviceOff = true
        let cloud = await r.read("cleared segment AC, nothing found", situation: s)
        #expect(onDevice.route.path == .onDevice && cloud.route.path == .cloud)
        #expect(paths.m.withLock { $0 } == [.onDevice, .cloud])
    }

    /// A note that does not look English is not sent to the cloud even with signal and consent when
    /// Apple's model is off; it reads by rules and its route says why. The app's bundled word lists drive it.
    @Test func aNoteThatIsNotEnglishIsNeverSentToTheCloud() async throws {
        final class Paths: @unchecked Sendable { let m = Mutex<[RoutePath]>([]) }
        let paths = Paths()
        struct Recording: ReadModelRunner {
            let paths: Paths
            func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
                paths.m.withLock { $0.append(path) }
                return .success(ReportReading.unclear(quote: String(text.prefix(40))))
            }
            func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.other) }
        }
        var r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in 100 })
        r.makeRunner = { _, _, _ in Recording(paths: paths) }
        r.deviceStatus = { OnDeviceStatus(available: false, localeSupported: true, contextSize: 4096, variant: "test") }
        var s = situation(mode: "drill")
        s.networkOnline = true
        s.cloudConsent = true
        let o = await r.read("Vi a una señora mayor con un abrigo azul caminando hacia el río hace diez minutos.", situation: s)
        #expect(paths.m.withLock { $0 }.isEmpty)
        #expect(o.route.path == .rules && o.route.reason == .notEnglish)
        let english = await r.read("Cleared segment AC, nothing found.", situation: s)
        #expect(english.route.path == .cloud)
    }

    /// The reader hands the subject's description to code, which decides the match for Apple's model.
    @Test func onThePhoneTheMatchWithTheSubjectComesFromCode() async throws {
        struct Answer: ReadModelRunner {
            func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
                var r = ReportReading.unclear(quote: text)
                r.kind = .clue
                r.topColor = .blue
                r.matchesProfile = .inconsistent
                return .success(r)
            }
            func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.other) }
        }
        var r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in 100 })
        r.makeRunner = { _, _, _ in Answer() }
        r.deviceStatus = { OnDeviceStatus(available: true, localeSupported: true, contextSize: 4096, variant: "test") }
        var s = situation(mode: "drill")
        s.profile = ModelProfile(shared: .object(["clothingLastWorn": .string("blue coat")]))
        let o = await r.read("Saw someone in blue by the creek in AC", situation: s)
        #expect(o.route.path == .onDevice && o.reading.matchesProfile == .consistent)
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
    /// The token count is a call into Apple's model too: it gets the text with phone numbers removed.
    @Test func theTokenCounterNeverSeesAPhoneNumber() async throws {
        let seen = Mutex<[String]>([])
        let r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { text, _ in seen.withLock { $0.append(text) }; return 100 },
                             makeRunner: { _, _, _ in InstantRunner() })
        let situation = ReportSituation(incidentMode: "drill", knownSegmentIds: ["AC"], assignedSegmentIds: ["AC"], positionSegmentId: nil,
                                        profile: ModelProfile(shared: .null), networkOnline: false, cloudConsent: false)
        _ = await r.read("cleared segment AC, caller at 404-555-0123", situation: situation)
        let texts = seen.withLock { $0 }
        #expect(texts.count == 1 && !texts[0].contains("555") && texts[0].contains(PhoneNumbers.replacement))
    }

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

/// A model that copies the team's assignment (AC) into every reading, as spike S1 saw.
struct CopiesAssignmentRunner: ReadModelRunner {
    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure> {
        var r = ReportReading.unclear(quote: String(text.prefix(40)))
        r.kind = .cleared
        r.segmentIds = ["AC"]
        r.coverage = 0.8
        return .success(r)
    }
    func permissive(_ text: String) async -> Result<String, ReadFailure> { .failure(.other) }
}

@Suite struct ReportReaderSegmentTests {
    @Test func theGPSSegmentReachesTheReadNotTheModelsCopy() async throws {
        let r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             estimateTokens: { _, _ in 100 }, makeRunner: { _, _, _ in CopiesAssignmentRunner() })
        let situation = ReportSituation(incidentMode: "drill", knownSegmentIds: ["AA", "AB", "AC"], assignedSegmentIds: ["AC"],
                                        positionSegmentId: "AB", profile: ModelProfile(shared: .null), networkOnline: false, cloudConsent: false)
        let o = await r.read("we cleared our area, coverage point eight", situation: situation)
        #expect(o.reading.segmentIds == ["AB"])
    }
}

/// Records routes synchronously (no timing in the test).
final class RouteLog: Sendable {
    private let box = Mutex<[RouteRecord]>([])
    var routes: [RouteRecord] { box.withLock { $0 } }
    func add(_ r: RouteRecord) { box.withLock { $0.append(r) } }
}

@Suite struct ReportReaderTelemetryTests {
    @Test func everyReadRecordsExactlyOneRouteTrace() async throws {
        let log = RouteLog()
        let r = ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: .defaults, screen: try BundledConstants.evidenceScreen(),
                             recordRoute: { route in log.add(route) })
        let s = ReportSituation(incidentMode: "drill", knownSegmentIds: ["AC"], assignedSegmentIds: ["AC"], positionSegmentId: nil,
                                profile: ModelProfile(shared: .null), networkOnline: false, cloudConsent: false)
        let evidence = await r.read("there is blood on a rock by the creek", situation: s)
        var notDrill = s; notDrill.incidentMode = nil
        let parsed = await r.read("cleared segment AC, coverage point eight", situation: notDrill)
        #expect(log.routes == [evidence.route, parsed.route])
    }
}
