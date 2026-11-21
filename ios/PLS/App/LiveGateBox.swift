import Foundation
import PLSCore
import Synchronization

/// The cloud gate as it is right now (connectivity, consent, kill switch, incident mode),
/// readable from any thread. PLSCore reads it again at the moment of every cloud dispatch.
final class LiveGateBox: Sendable {
    private let gate: Mutex<LiveGate>

    init(_ initial: LiveGate) {
        gate = Mutex(initial)
    }

    var current: LiveGate { gate.withLock { $0 } }

    func update(_ change: (inout LiveGate) -> Void) {
        gate.withLock { change(&$0) }
    }
}

/// The incident, team and mode of the mission on screen.
struct MissionKey: Equatable, Sendable {
    let incidentId: String
    let teamId: String
    let mode: String

    init?(_ mission: Mission?) {
        guard let mission else { return nil }
        incidentId = mission.incidentId
        teamId = mission.teamId
        mode = mission.mode
    }
}

/// The mission on screen as a key, readable from any thread: a report checks it right before every model call, so no
/// model reads for a mission that changed while the report waited.
final class MissionKeyBox: Sendable {
    private let key = Mutex<MissionKey?>(nil)

    var current: MissionKey? { key.withLock { $0 } }

    func set(_ value: MissionKey?) { key.withLock { $0 = value } }
}
