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
    var config = RemoteConfigValues.defaults
    var cloudConsent = false { didSet { refreshGate() } }
    private(set) var mission: Mission?
    private(set) var store: EventStore?
    private(set) var sending = false
    var problem: String?
    private var identity: DeviceIdentity?
    private var reader: ReportReader?

    private var started = false
    private var wasOnline = false

    func start() {
        guard !started else { return }
        started = true
        connectivity.onChange = { [weak self] in self?.connectivityChanged() }
        connectivity.start()
        do {
            identity = try DeviceIdentity()
            reader = ReportReader(ai: AIClient.make(useLimitedUseTokens: config.useLimitedUseTokens), config: config,
                                  screen: try BundledConstants.evidenceScreen())
            store = try EventStore(server: FirestoreEventServer(db: Firestore.firestore()),
                                   outboxURL: DeviceIdentity.storeDirectory().appendingPathComponent("outbox.json"))
            store?.reconcileUnresolved()
        } catch {
            problem = "This phone could not open its report journal. Tell command."
        }
    }

    /// Back in signal: settle every report that has no answer yet.
    func connectivityChanged() {
        refreshGate()
        let online = connectivity.isOnline
        if online && !wasOnline { store?.reconcileUnresolved() }
        wasOnline = online
    }

    /// Back in the foreground: the same check, in case the reconnect happened while suspended.
    func becameActive() {
        if connectivity.isOnline { store?.reconcileUnresolved() }
    }

    func retry(_ eventId: String) {
        if store?.retry(eventId) == .offline { problem = "No signal. Retry when you are back in signal." }
    }

    func load(_ mission: Mission) {
        self.mission = mission
        refreshGate()
    }

    func refreshGate() {
        let online = connectivity.isOnline, consent = cloudConsent, kill = config.killCloud, mode = mission?.mode
        gate.update { $0 = LiveGate(networkOnline: online, cloudConsent: consent, killCloud: kill, incidentMode: mode) }
    }

    /// Reads the report, builds the one event and journals it. The Firestore write is never awaited.
    func send(_ text: String, inputMethod: InputMethod) async {
        guard let mission, let reader, let identity, let store else { problem = "No pack loaded."; return }
        guard let uid = identity.uid else { problem = "Not signed in yet. Stay in signal for a moment."; return }
        sending = true
        defer { sending = false }
        refreshGate()

        let position = await location.fix(timeout: 10)
        let situation = ReportSituation(
            incidentMode: mission.mode, knownSegmentIds: mission.grid.map(\.segmentId),
            assignedSegmentIds: mission.assignedSegmentIds,
            positionSegmentId: position.flatMap { Geo.segment(containing: $0, in: mission.grid) },
            profile: mission.profile, networkOnline: connectivity.isOnline, cloudConsent: cloudConsent,
            liveGate: { [gate] in gate.current })
        let outcome = await reader.read(text, situation: situation)

        do {
            let context = OutcomeContext(
                incidentId: mission.incidentId, teamId: mission.teamId, deviceId: uid, authorUid: uid,
                priorVersion: mission.priorVersion, clientTimeMs: Date().timeIntervalSince1970 * 1000,
                inputMethod: inputMethod, isTrainingInject: false, grid: mission.grid,
                effect: EffectContext(grid: mission.grid, assignedSegmentIds: mission.assignedSegmentIds, position: nil,
                                      visualDetectionRangeM: mission.visualDetectionRangeM, rdBasis: mission.rdBasis),
                params: mission.params)
            let event = ReadOutcomeBuilder.event(from: outcome, rawText: text, position: position, context: context,
                                                 seq: try identity.nextSeq())
            try store.append(event)
            problem = nil
        } catch {
            problem = "The report was not saved on this phone. Try again."
        }
    }
}
