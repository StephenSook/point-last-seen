import Foundation
import Network
import Observation
import PLSCore

/// Feeds the OS network path and request outcomes into PLSCore's Connectivity, which is what
/// `networkOnline` means for the router: a satisfied path and no transport failure in the last
/// minute since the last success.
@MainActor
@Observable
final class ConnectivityMonitor {
    private(set) var connectivity = Connectivity(holdMs: 60_000)
    private let monitor = NWPathMonitor()

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let satisfied = path.status == .satisfied
            Task { @MainActor in self?.connectivity.pathChanged(satisfied: satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "pls.network"))
    }

    var isOnline: Bool { connectivity.isOnline(nowMs: Self.nowMs()) }

    func requestFailed() { connectivity.requestFailed(atMs: Self.nowMs()) }
    func requestSucceeded() { connectivity.requestSucceeded(atMs: Self.nowMs()) }

    static func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
