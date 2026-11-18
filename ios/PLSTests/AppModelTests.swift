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
                             speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }))
        let mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget,
                              assignment: Assignment(teamId: "T1", segmentIds: ["AC"], taskText: "Walk the creek bank.", reason: "r"))
        await model.load(mission)
        await model.load(mission)
        #expect(voice.spoken == ["New assignment. Segment A C. Walk the creek bank."])
    }

    @Test func theLinkGlyphFollowsSignalAndWaitingReports() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        #expect(model.linkState == LinkState.make(online: false, waiting: 0))             // nothing started, no store
    }
}

