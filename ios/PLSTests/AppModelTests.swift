import CoreGraphics
import Foundation
import PLSCore
import Testing
@testable import PLS

/// Auth whose token claims cannot be read: the loaded mission stays, so a test does not depend on the Auth user this
/// simulator happens to hold.
final class NoClaimsJoinBackend: JoinBackend, @unchecked Sendable {
    func ensureSignedIn() async -> Bool { true }
    func callJoin(_ payload: [String: String]) async throws -> JSONValue { throw JoinCallError.refused }
    func refreshClaims() async throws -> [String: JSONValue] { throw JoinCallError.refused }
    func currentClaims(forceRefresh: Bool) async -> [String: JSONValue]? { nil }
}

@MainActor
@Suite struct AppModelTests {
    /// Without the cloud route (iOS 26) the live gate keeps the cloud off at every cloud dispatch, as the
    /// reader's first decision does, so a reroute after an on-device failure can never pick the cloud.
    @Test func withoutTheCloudRouteTheLiveGateKeepsTheCloudOff() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        model.cloudConsent = true
        model.cloudRouteAvailable = false
        #expect(model.gate.current.killCloud)
        model.cloudRouteAvailable = true
        #expect(!model.gate.current.killCloud)
    }

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
                             speaker: AssignmentSpeaker(onDevice: voice, makeCloud: { _ in FakeVoice() }, record: { _ in }), uid: { "uid-1" })
        var mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget,
                              assignment: Assignment(teamId: "T1", segmentIds: ["AC"], taskText: "Walk the creek bank.", reason: "r"))
        mission.owner = model.currentSession             // a mission is spoken only in the session it was read in
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
            // A user is on the phone either way (cached for offline use); only the sign-in check differs.
            let model = AppModel(signIn: SignIn(isSignedIn: { signedIn }, attempt: { false }),
                                 speaker: AssignmentSpeaker(onDevice: onDevice, makeCloud: { _ in cloud }, record: { _ in }), uid: { "uid-1" })
            model.config.voiceTemplateId = "voice-template"
            model.connectivity.pathChanged(satisfied: true)
            var mission = try spokenMission()
            mission.owner = model.currentSession         // a mission is spoken only in the session it was read in
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
        }, joinBackend: NoClaimsJoinBackend())
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

    /// A photo model with a fake reader and a journal; the reader's answer is fixed per test.
    func photoModel(_ answer: PhotoReadResult, available: Bool = true) throws -> (AppModel, EventStore) {
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                             readPhoto: { _ in answer }, photoReaderAvailable: { available }, joinBackend: NoClaimsJoinBackend())
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("photo-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        return (model, store)
    }

    static func onePixel() throws -> CGImage {
        let ctx = try #require(CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        return try #require(ctx.makeImage())
    }

    /// A photo of a described item is one clue report, written by code, read on this phone.
    @Test func aPhotoOfSomethingFoundIsJournalledAsAClue() async throws {
        let cap = PhotoDescription(showsPerson: false, object: "red baseball cap", color: .red, kind: .hat)
        let (model, store) = try photoModel(.described(cap, model: "test-model", latencyMs: 1500))
        var mission = try quietMission()
        mission.profile = ModelProfile(shared: .object(["clothingLastWorn": .string("a red baseball cap")]))
        await model.load(mission)
        #expect(model.canReadPhoto)
        #expect(await model.submitPhoto(try Self.onePixel()))
        let doc = try #require(store.entries.first?.doc)
        #expect(doc.inputMethod == .photo && doc.rawText == "Photo: red baseball cap.")
        #expect(doc.reading?["kind"] == .string("clue") && doc.reading?["matchesProfile"] == .string("consistent"))
        #expect(doc.route?.path == .onDevice && doc.route?.model == "test-model" && doc.route?.latencyMs == 1500)
        #expect(model.problem == nil)
    }

    @Test func aPhotoThatShowsAPersonIsNotKeptOrSent() async throws {
        let person = PhotoDescription(showsPerson: true, object: "red baseball cap", color: .red, kind: .hat)
        let (model, store) = try photoModel(.described(person, model: "test-model", latencyMs: 1500))
        await model.load(try quietMission())
        #expect(await model.submitPhoto(try Self.onePixel()) == false)
        #expect(store.entries.isEmpty)
        #expect(model.problem == PhotoClue.personMessage)
    }

    @Test func aPhotoThatCouldNotBeReadSendsNothing() async throws {
        let (model, store) = try photoModel(.failed)
        await model.load(try quietMission())
        #expect(await model.submitPhoto(try Self.onePixel()) == false)
        #expect(store.entries.isEmpty)
        #expect(model.problem == AppModel.photoReadFailed)
    }

    @MainActor final class ModelBox { var model: AppModel? }

    /// A read that finishes after the searcher left the search is dropped: nothing is journalled for that mission.
    @Test func aPhotoReadThatOutlivesItsMissionIsDropped() async throws {
        let box = ModelBox()
        let cap = PhotoDescription(showsPerson: false, object: "red cap", color: .red, kind: .hat)
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                             readPhoto: { _ in
                                 _ = await box.model?.leaveSearch()
                                 return .described(cap, model: "m", latencyMs: 1)
                             }, photoReaderAvailable: { true }, joinBackend: NoClaimsJoinBackend())
        box.model = model
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("stale-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await model.load(try quietMission())
        #expect(await model.submitPhoto(try Self.onePixel()) == false)
        #expect(model.mission == nil)
        #expect(store.entries.isEmpty)
    }

    /// The same mission loaded again while the photo is read (a refresh, a new plan) keeps the report.
    @Test func aPhotoReadKeepsItsReportWhenTheSameMissionReloads() async throws {
        let box = ModelBox()
        let mission = try quietMission()
        let cap = PhotoDescription(showsPerson: false, object: "red cap", color: .red, kind: .hat)
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                             readPhoto: { _ in
                                 await box.model?.load(mission)
                                 return .described(cap, model: "m", latencyMs: 1)
                             }, photoReaderAvailable: { true }, joinBackend: NoClaimsJoinBackend())
        box.model = model
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("reload-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await model.load(mission)
        #expect(await model.submitPhoto(try Self.onePixel()))
        #expect(store.entries.count == 1)
    }

    /// The same for a typed report.
    @Test func aTypedReadThatOutlivesItsMissionIsDropped() async throws {
        let box = ModelBox()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                             readReport: { text, _, _, _ in
                                 _ = await box.model?.leaveSearch()
                                 let route = RouteRecord(platform: .ios, path: .rules, stage: .deterministicParser, model: "none", reason: .onDeviceDefault,
                                                         latencyMs: 1, sdkReported: false, blocked: nil, decidedAtMs: 0)
                                 return ReadOutcome(reading: .unclear(quote: text), route: route, validation: .ok)
                             }, joinBackend: NoClaimsJoinBackend())
        box.model = model
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("stale-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await model.load(try quietMission())
        _ = await model.submit("Cleared AC", inputMethod: .typed)
        #expect(store.entries.isEmpty)
    }

    /// The photo button shows only when Apple's model can read photos here, in a drill that lets a model read.
    @Test func photosAreReadOnlyWhereAModelMayReadThem() async throws {
        let cap = PhotoDescription(showsPerson: false, object: "cap", color: .red, kind: .hat)
        let (off, _) = try photoModel(.described(cap, model: "m", latencyMs: 1), available: false)
        await off.load(try quietMission())
        #expect(off.canReadPhoto == false)
        let (live, liveStore) = try photoModel(.described(cap, model: "m", latencyMs: 1))
        var mission = try quietMission()
        mission.mode = "search"
        await live.load(mission)
        #expect(live.canReadPhoto == false)
        #expect(await live.submitPhoto(try Self.onePixel()) == false && liveStore.entries.isEmpty)
    }

    /// A found object read as a clue keeps its reason with the report on this phone, for the receipt, and the
    /// subject's names from the shared profile reach the reader (for the found-kind rule only).
    @Test func aCorrectedFoundKeepsItsReasonWithTheReport() async throws {
        final class Seen: @unchecked Sendable { var names: [String] = [] }
        let seen = Seen()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                             readReport: { text, situation, _, _ in
            seen.names = situation.subjectNames
            let route = RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "apple", reason: .onDeviceDefault,
                                    latencyMs: 640, sdkReported: false, blocked: nil, decidedAtMs: 0)
            var reading = ReportReading.unclear(quote: text)
            reading.kind = .clue
            reading.segmentIds = ["AC"]
            reading.item = "blue coat"
            return ReadOutcome(reading: reading, route: route, validation: .ok, foundKindReason: FoundKind.reason)
        }, joinBackend: NoClaimsJoinBackend())
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("found-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        model.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        var mission = try quietMission()
        mission.sharedProfile = try JSONDecoder().decode(SharedProfile.self, from: Data(#"{"answersTo":"Bea","otherNames":["Mama Bea"]}"#.utf8))
        await model.load(mission)
        #expect(await model.submit("Found a blue coat by the creek in AC", inputMethod: .typed) == "")
        #expect(store.entries.first?.foundKindReason == FoundKind.reason)
        #expect(seen.names == ["Bea", "Mama Bea"])
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
