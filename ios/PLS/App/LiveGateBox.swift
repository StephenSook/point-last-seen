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
