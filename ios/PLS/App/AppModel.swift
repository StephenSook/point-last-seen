import FirebaseAuth
import FirebaseFirestore
import Foundation
import Observation
import PLSCore

/// The searcher phone's state and its one action: send a report.
@MainActor
@Observable
final class AppModel {
    let connectivity = ConnectivityMonitor()
    let location = LocationProvider()
    let gate = LiveGateBox(LiveGate(networkOnline: false, cloudConsent: false, killCloud: false, incidentMode: nil))
    let signIn: SignIn
    private(set) var signedIn = false

    /// This build's version (CFBundleShortVersionString), compared with `minimum_version_ios`.
    let appVersion: String

    /// Speaks new assignments (on-device voice, or the AI Logic voice when Remote Config names one).
    let speaker: AssignmentSpeaker

    /// The signed-in uid (the device id in event ids) and the clock; seams for tests.
    private let uid: () -> String?
    private let nowMs: () -> Double

    init(signIn: SignIn = .firebase(),
         appVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
         speaker: AssignmentSpeaker? = nil,
         uid: @escaping () -> String? = { Auth.auth().currentUser?.uid },
         nowMs: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
         measurements: MeasurementWriter? = nil) {
        self.signIn = signIn
        self.appVersion = appVersion
        self.speaker = speaker ?? AssignmentSpeaker()
        self.uid = uid
        self.nowMs = nowMs
        self.measurements = measurements
    }

    /// Writes each report's timings; Firestore unless a test supplies one.
    private var measurements: MeasurementWriter?
    /// The posterior over the team's segments, recomputed after every report (the map draws it).
    private(set) var posterior: PosteriorResult?

    /// Uses a journal and identity made elsewhere (tests).
    func attach(store: EventStore, identity: DeviceIdentity, screen: EvidenceScreen? = nil) {
        self.store = store
        self.identity = identity
        if let screen { self.screen = screen }
    }

    /// True for 5 seconds after this phone sent a report, until it is undone.
    func canUndo(_ eventId: String) -> Bool {
        guard let entries = store?.entries, let entry = entries.first(where: { $0.eventId == eventId }),
              entry.doc.type != .retraction, entry.doc.authorUid == uid(),
              !entries.contains(where: { $0.doc.type == .retraction && $0.doc.targetEventId == eventId }) else { return false }
        return ReadOutcomeBuilder.canUndo(sentAtMs: entry.doc.clientTimeMs, nowMs: nowMs())
    }

    /// Undo is a new `retraction` event that targets the report; the report itself is never edited.
    func undo(_ eventId: String) {
        guard canUndo(eventId), let store, let identity, let uid = uid(),
              let entry = store.entries.first(where: { $0.eventId == eventId }) else { return }
        do {
            let retraction = try ReadOutcomeBuilder.retraction(of: entry.doc, authorUid: uid, deviceId: uid,
                                                               seq: try identity.nextSeq(), clientTimeMs: nowMs())
            try store.append(retraction)
            problem = nil
        } catch {
            problem = "The undo was not saved on this phone. Try again."
        }
    }

    /// The urgency chip on the approach card, from the incident's conditions (search urgency only).
    var urgency: UrgencyLevel {
        guard let rule = try? BundledConstants.urgencyRule() else { return .none }
        return rule.level(conditions: mission?.conditions)
    }

    /// The header's link glyph: signal and reports still on this phone.
    var linkState: LinkState {
        let waiting = store?.entries.filter { $0.state == .pending || $0.state == .checking }.count ?? 0
        return LinkState.make(online: connectivity.isOnline, waiting: waiting)
    }

    /// What the Live Activity shows; nil while no pack is loaded.
    var taskStatus: TaskStatus? {
        mission.map { TaskStatus.make(assignedSegmentIds: $0.assignedSegmentIds, states: store?.entries.map(\.state) ?? []) }
    }

    /// Shown when command has raised the minimum version above this build. It asks, it does not
    /// block: a searcher in the field can still send reports on an old build.
    var updatePrompt: String? {
        config.needsUpdate(appVersion: appVersion)
            ? "Update this app. Command needs version \(config.minimumVersionIOS) or newer. Reports still send." : nil
    }
    /// Remote Config values. Read at the moment of each send, and a change reaches the live
    /// gate at once, so a kill-switch flip takes effect without a restart.
    var config = RemoteConfigValues.defaults { didSet { refreshGate() } }
    var cloudConsent = false { didSet { refreshGate() } }
    private(set) var mission: Mission?
    private(set) var store: EventStore?
    private(set) var sending = false
    /// The last GPS fix this phone got; the screen theme uses it to know when it is dusk here.
    private(set) var lastFix: Position?
    var problem: String?
    private var identity: DeviceIdentity?
    private var screen: EvidenceScreen?

    private var started = false
    private var remoteConfig: RemoteConfigStore?
    private var wasOnline = false

    func start() {
        guard !started else { return }
        started = true
        connectivity.onChange = { [weak self] in self?.connectivityChanged() }
        connectivity.start()
        let remoteConfig = RemoteConfigStore()
        remoteConfig.onChange = { [weak self] in self?.config = $0 }
        remoteConfig.start()
        self.remoteConfig = remoteConfig
        Task { await self.trySignIn() }
        // Each failure gets its own message, so the person and command know what to fix.
        do { identity = try DeviceIdentity() } catch {
            problem = "This phone could not start its report numbering. Tell command."
        }
        do { screen = try BundledConstants.evidenceScreen() } catch {
            problem = "This app is missing its evidence word list. Reinstall the app."
        }
        do {
            let store = try EventStore(server: FirestoreEventServer(db: Firestore.firestore()),
                                       outboxURL: DeviceIdentity.storeDirectory().appendingPathComponent("outbox.json"))
            if store.damagedJournal != nil {
                problem = "A damaged report journal was set aside. Reports from before may need to be sent again."
            }
            store.reconcileUnresolved()
            self.store = store
        } catch {
            problem = "This phone could not open its report journal. Tell command."
        }
    }

    /// Back in signal: settle every report that has no answer yet.
    func connectivityChanged() {
        refreshGate()
        let online = connectivity.isOnline
        if online && !wasOnline {
            store?.reconcileUnresolved()
            Task { await trySignIn() }
        }
        wasOnline = online
    }

    func trySignIn() async {
        signedIn = await signIn.ensure()
    }

    /// Back in the foreground: the same check, in case the reconnect happened while suspended.
    func becameActive() {
        if connectivity.isOnline { store?.reconcileUnresolved() }
    }

    func retry(_ eventId: String) {
        if store?.retry(eventId) == .offline { problem = "No signal. Retry when you are back in signal." }
    }

    /// Loads a pack, then speaks the team's approved assignment if it is new (eyes stay on the ground).
    func load(_ mission: Mission) async {
        let newIncident = self.mission?.incidentId != mission.incidentId
        self.mission = mission
        refreshGate()
        if newIncident { store?.listen(incidentId: mission.incidentId) }
        await speaker.update(mission.assignment, cloudModel: config.ttsModelIOS, online: connectivity.isOnline,
                             killCloud: config.killCloud)
    }

    func refreshGate() {
        let online = connectivity.isOnline, consent = cloudConsent, kill = config.killCloud, mode = mission?.mode
        gate.update { $0 = LiveGate(networkOnline: online, cloudConsent: consent, killCloud: kill, incidentMode: mode) }
    }

    /// Sends a report and returns the text to leave in the field: empty once the report is
    /// journaled on this phone, the same words when it was not, so nothing the searcher said is lost.
    func submit(_ text: String, inputMethod: InputMethod) async -> String {
        guard !sending else { return text }
        return await send(text, inputMethod: inputMethod) ? "" : text
    }

    /// Reads the report, builds the one event and journals it. The Firestore write is never
    /// awaited. Returns true once the event is in the journal.
    private func send(_ text: String, inputMethod: InputMethod) async -> Bool {
        guard let mission, let screen, let identity, let store else { problem = "No pack loaded."; return false }
        await trySignIn()
        guard let uid = self.uid() else { problem = "Not signed in yet. Stay in signal for a moment."; return false }
        sending = true
        defer { sending = false }
        refreshGate()
        let submittedAt = nowMs()

        let position = await location.fix(timeout: 10)
        if let position { lastFix = position }
        let situation = ReportSituation(
            incidentMode: mission.mode, knownSegmentIds: mission.grid.map(\.segmentId),
            assignedSegmentIds: mission.assignedSegmentIds,
            positionSegmentId: position.flatMap { Geo.segment(containing: $0, in: mission.grid) },
            profile: mission.profile, networkOnline: connectivity.isOnline, cloudConsent: cloudConsent,
            liveGate: { [gate] in gate.current })
        let reader = ReportReader(ai: AIClient.make(useLimitedUseTokens: config.useLimitedUseTokens), config: config, screen: screen)
        let outcome = await reader.read(text, situation: situation)
        let readDone = nowMs()
        switch outcome.cloudTransport {
        case .failed: connectivity.requestFailed()
        case .succeeded: connectivity.requestSucceeded()
        case .notUsed: break
        }

        do {
            let context = OutcomeContext(
                incidentId: mission.incidentId, teamId: mission.teamId, deviceId: uid, authorUid: uid,
                priorVersion: mission.priorVersion, clientTimeMs: submittedAt,
                inputMethod: inputMethod, isTrainingInject: false, grid: mission.grid,
                effect: EffectContext(grid: mission.grid, assignedSegmentIds: mission.assignedSegmentIds, position: nil,
                                      visualDetectionRangeM: mission.visualDetectionRangeM, rdBasis: mission.rdBasis),
                params: mission.params)
            let event = ReadOutcomeBuilder.event(from: outcome, rawText: text, position: position, context: context,
                                                 seq: try identity.nextSeq())
            try store.append(event)
            problem = nil
            recomputePosterior(mission)
            let measurement = ReadMeasurement(submittedAtMs: submittedAt, readDoneAtMs: readDone, redrawnAtMs: nowMs())
            (measurements ?? FirestoreMeasurementWriter()).write(
                measurement, path: ReadMeasurement.path(incidentId: mission.incidentId, teamId: mission.teamId, deviceId: uid,
                                                        eventId: event.eventId))
            return true
        } catch {
            problem = "The report was not saved on this phone. Try again."
            return false
        }
    }

    /// The posterior from the pack's prior and this phone's journal (events already in the prior
    /// are left out by the shared filter).
    private func recomputePosterior(_ mission: Mission) {
        // Every member's events from the listener plus this phone's journal, once each.
        var byId: [String: EventDoc] = [:]
        for doc in (store?.teamEvents ?? []) + (store?.entries.map(\.doc) ?? []) { byId[doc.eventId] = doc }
        let docs = Array(byId.values)
        posterior = Posterior.compute(prior: mission.prior,
                                      events: EventFilter.toEngineEvents(docs, priorInputEventIds: mission.priorInputEventIds),
                                      params: mission.params)
    }
}
