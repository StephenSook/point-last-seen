import Foundation
import PLSCore
import Testing
@testable import PLS

/// The release route check reads one fixed drill sentence on each route with the app's own reader:
/// on-device with no network and no cloud, then the cloud route with Apple's model turned off for
/// that read. It runs only on a practice incident and journals nothing.
@MainActor
@Suite struct RouteCheckTests {
    final class Seen: @unchecked Sendable { var reads: [(String, ReportSituation)] = [] }

    func model(_ seen: Seen) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, readReport: { text, situation, _, _ in
            seen.reads.append((text, situation))
            let path: RoutePath = situation.onDeviceOff ? .cloud : .onDevice
            let route = RouteRecord(platform: .ios, path: path, stage: .guided, model: path == .cloud ? "gemini" : "apple",
                                    reason: .onDeviceDefault, latencyMs: 640, sdkReported: false, blocked: nil, decidedAtMs: 0)
            return ReadOutcome(reading: ReportReading.unclear(quote: text), route: route, validation: .ok)
        })
    }

    func mission(mode: String, practice: Bool = false) throws -> Mission {
        var m = Mission(incidentId: "drill-test-1", mode: mode, teamId: "T1", priorVersion: 2, grid: [], prior: [],
                        assignedSegmentIds: ["BO"], params: try BundledConstants.engineParams(), profile: ModelProfile(shared: .null),
                        sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
        m.isPractice = practice
        return m
    }

    @Test func eachRouteReadsTheFixedSentenceAsIntended() async throws {
        let seen = Seen()
        let m = model(seen)
        m.connectivity.pathChanged(satisfied: true)
        await m.load(try mission(mode: "drill", practice: true))
        let onDevice = try #require(await m.routeCheck(.onDevice))
        let cloud = try #require(await m.routeCheck(.cloud))
        #expect(seen.reads.map(\.0) == ["Cleared segment BO, nothing found.", "Cleared segment BO, nothing found."])
        let (d, c) = (seen.reads[0].1, seen.reads[1].1)
        #expect(d.incidentMode == "drill" && !d.networkOnline && !d.cloudConsent && !d.onDeviceOff && d.liveGate == nil)
        #expect(c.incidentMode == "drill" && c.networkOnline && c.cloudConsent && c.onDeviceOff && c.liveGate == nil)
        #expect(onDevice.route.path == .onDevice && cloud.route.path == .cloud)
    }

    /// Outside a practice incident the check reads nothing: the cloud route would send the person's
    /// description, and a real search's reports only go to the cloud with the searcher's consent.
    @Test func aRealSearchIsNeverRouteChecked() async throws {
        let seen = Seen()
        let m = model(seen)
        await m.load(try mission(mode: "real"))
        let onDevice = await m.routeCheck(.onDevice)
        let cloud = await m.routeCheck(.cloud)
        #expect(onDevice == nil && cloud == nil)
        #expect(seen.reads.isEmpty && !m.canRouteCheck)
    }

    /// A live drill (not the practice drill) is never route checked either: its cloud route would send the
    /// drill subject's description. Only the practice drill's sample data goes.
    @Test func aLiveDrillIsNeverRouteChecked() async throws {
        let seen = Seen()
        let m = model(seen)
        m.connectivity.pathChanged(satisfied: true)
        await m.load(try mission(mode: "drill"))
        #expect(!m.canRouteCheck)
        let onDevice = await m.routeCheck(.onDevice)
        let cloud = await m.routeCheck(.cloud)
        #expect(onDevice == nil && cloud == nil && seen.reads.isEmpty)
    }
}
