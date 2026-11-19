import Foundation
import PLSCore
import Testing
@testable import PLS

/// Stands in for iOS notification permission and remote registration.
final class FakeAlerts: AlertPermission, @unchecked Sendable {
    var state: AlertState = .notAsked
    var grants = true
    private(set) var requests = 0
    private(set) var registrations = 0
    func current() async -> AlertState { state }
    func request() async -> Bool {
        requests += 1
        state = grants ? .allowed : .refused
        return grants
    }
    func registerForPushes() async { registrations += 1 }
}

/// After the first join the phone asks once, in one plain sentence, whether new assignments may
/// reach a locked screen; when alerts are already allowed it only registers.
@MainActor
@Suite struct AlertOfferTests {
    func model(_ alerts: FakeAlerts, _ defaults: UserDefaults) throws -> AppModel {
        let segments = try DrillDocs.segments()
        let docs = MissionDocs(incident: try DrillDocs.incident(), segments: segments, plan: nil, sharedProfile: nil)
        return AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                        speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }),
                        joinBackend: FakeJoinBackend(), missionReader: FakeMissionReader(docs: docs), pushTopics: FakePushTopics(),
                        alerts: alerts, defaults: defaults)
    }

    func freshDefaults() -> UserDefaults {
        let name = "alerts-\(UUID().uuidString)"
        return UserDefaults(suiteName: name)!
    }

    @Test func theOfferShowsOnceAfterAJoinAndRegistersWhenAllowed() async throws {
        let alerts = FakeAlerts(), defaults = freshDefaults()
        let m = try model(alerts, defaults)
        #expect(!m.offersAlerts)
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        #expect(m.offersAlerts && AlertOffer.sentence == "Turn on alerts so a new assignment reaches you on a locked screen.")
        await m.answerAlerts(true)
        #expect(alerts.requests == 1 && alerts.registrations == 1 && !m.offersAlerts)
        // Asked once, also after a relaunch.
        let again = try model(alerts, defaults)
        await again.trySignIn()
        #expect(!again.offersAlerts)
    }

    @Test func notNowAsksNothing() async throws {
        let alerts = FakeAlerts()
        let m = try model(alerts, freshDefaults())
        await m.join(code: "ABCDEFGH", teamId: "T1", incidentId: "")
        await m.answerAlerts(false)
        #expect(alerts.requests == 0 && alerts.registrations == 0 && !m.offersAlerts)
    }

    @Test func alertsAlreadyAllowedOnlyRegister() async throws {
        let alerts = FakeAlerts()
        alerts.state = .allowed
        let m = try model(alerts, freshDefaults())
        await m.trySignIn()
        #expect(!m.offersAlerts && alerts.requests == 0 && alerts.registrations == 1)
    }
}
