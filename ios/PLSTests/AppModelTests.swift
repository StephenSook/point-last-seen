import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
@Suite struct AppModelTests {
    @Test func aReportThatCannotBeJournaledStaysInTheField() async {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))   // no pack, nothing started
        let left = await model.submit("cleared segment AC, coverage point eight", inputMethod: .typed)
        #expect(left == "cleared segment AC, coverage point eight")
        #expect(model.problem == "No pack loaded.")
        #expect(model.sending == false)
    }

    @Test func aKillSwitchFlipReachesTheLiveGateAtOnce() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.gate.current.killCloud == false)
        model.config.killCloud = true
        #expect(model.gate.current.killCloud == true)
    }

    @Test func aRaisedMinimumVersionAsksThisBuildToUpdate() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), appVersion: "0.1.0")
        #expect(model.updatePrompt == nil)
        model.config.minimumVersionIOS = "0.2.0"
        #expect(model.updatePrompt == "Update this app. Command needs version 0.2.0 or newer. Reports still send.")
        model.config.minimumVersionIOS = "0.1.0"
        #expect(model.updatePrompt == nil)
    }

    @Test func theAppVersionComesFromTheBundle() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.appVersion == Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)
        #expect(!model.appVersion.isEmpty)
    }

    @Test func loadingAPackSpeaksTheApprovedAssignmentOnce() async throws {
        let voice = FakeVoice()
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }),
                             speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }), uid: { nil })
        let mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget,
                              assignment: Assignment(teamId: "T1", segmentIds: ["AC"], taskText: "Walk the creek bank.", reason: "r"))
        await model.load(mission)
        await model.speech?.value
        await model.load(mission)
        await model.speech?.value
        #expect(voice.spoken == ["New assignment. Segment A C. Walk the creek bank."])
    }

    @Test func theLinkGlyphFollowsSignalAndWaitingReports() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.linkState == LinkState.make(online: false, waiting: 0))             // nothing started, no store
    }

    @Test func theUrgencyChipFollowsTheIncidentsConditions() async throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.urgency == .none)                                                    // no pack
        var mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
        await model.load(mission)
        #expect(model.urgency == .none)                                                    // no conditions
        mission.conditions = IncidentConditions(tempF: 41, wet: true, setAtMs: 1)
        await model.load(mission)
        #expect(model.urgency == .coolWet)
    }

    func spokenMission() throws -> Mission {
        Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget,
                assignment: Assignment(teamId: "T1", segmentIds: ["AC"], taskText: "Walk the creek bank.", reason: "r"))
    }

    /// The AI Logic voice runs only once the phone is signed in; before that the phone's own voice speaks.
    @Test func theCloudVoiceWaitsForSignIn() async throws {
        for signedIn in [false, true] {
            let onDevice = FakeVoice(), cloud = FakeVoice()
            let user: String? = signedIn ? "uid-1" : nil
            let model = AppModel(signIn: SignIn(isSignedIn: { signedIn }, attempt: { false }),
                                 speaker: AssignmentSpeaker(onDevice: onDevice, makeCloud: { _ in cloud }, record: { _ in }), uid: { user })
            model.config.voiceTemplateId = "voice-template"
            model.connectivity.pathChanged(satisfied: true)
            var mission = try spokenMission()
            mission.ownerUid = user                      // a mission is spoken only for the user it was read for
            await model.load(mission)
            await model.speech?.value
            // Signed in is the control: it proves this setup does reach the cloud voice.
            #expect(cloud.spoken.count == (signedIn ? 1 : 0))
            #expect(onDevice.spoken.count == (signedIn ? 0 : 1))
        }
    }

    /// The order a send takes: sign-in first, then the read. A failed sign-in reads and sends nothing.
    @MainActor final class CallLog { var events: [String] = [] }
    @MainActor final class SignState { var signed = false }

    func sendModel(signIn: SignIn, uid: @escaping () -> String?, log: CallLog) throws -> (AppModel, EventStore) {
        let model = AppModel(signIn: signIn, uid: uid, measurements: FakeMeasurementWriter(), readReport: { text, situation, config, screen in
            log.events.append("read")
            return await ReportReader(ai: AIClient.make(useLimitedUseTokens: true), config: config, screen: screen).read(text, situation: situation)
        })
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("order-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        return (model, store)
    }

    func quietMission() throws -> Mission {
        Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
    }

    @Test func aFailedSignInReadsNothingAndSendsNothing() async throws {
        let log = CallLog()
        let (model, store) = try sendModel(signIn: SignIn(isSignedIn: { false }, attempt: { log.events.append("signIn"); return false }),
                                           uid: { nil }, log: log)
        await model.load(try quietMission())
        let text = "there is blood on a rock by the creek"
        #expect(await model.submit(text, inputMethod: .typed) == text)
        #expect(log.events == ["signIn"])
        #expect(store.entries.isEmpty)
    }

    @Test func aReadStartsOnlyAfterSignInSucceeded() async throws {
        let log = CallLog(), state = SignState()
        let (model, store) = try sendModel(signIn: SignIn(isSignedIn: { state.signed },
                                                          attempt: { log.events.append("signIn"); state.signed = true; return true }),
                                           uid: { state.signed ? "uid-1" : nil }, log: log)
        await model.load(try quietMission())
        #expect(await model.submit("there is blood on a rock by the creek", inputMethod: .typed) == "")
        #expect(log.events == ["signIn", "read"])
        #expect(store.entries.count == 1)
    }
}
