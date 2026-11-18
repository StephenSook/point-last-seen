import CoreLocation
import Foundation
import PLSCore

/// One Core Location fix with a timeout. No fix (airplane mode under cover, or no permission)
/// returns nil, and the report then takes its segment from the team's assignment. Each request
/// has its own token, so an earlier request's timer or late callback cannot answer a later one.
@MainActor
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let gate = FixGate<Position?>()
    private var token: UInt64 = 0
    private var requestedAt = Date.distantPast
    private var timer: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestPermission() { manager.requestWhenInUseAuthorization() }

    /// Waits at most `timeout` seconds (spike S-GPS sets the field value).
    func fix(timeout: TimeInterval = 30) async -> Position? {
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways,
              !gate.isWaiting else { return nil }
        return await gate.wait { t in
            token = t
            requestedAt = Date()
            manager.requestLocation()
            timer = Task { [weak self] in
                try? await Task.sleep(for: .seconds(timeout))
                guard !Task.isCancelled else { return }
                self?.gate.finish(nil, token: t)
            }
        }
    }

    private func deliver(_ p: Position?, at time: Date?) {
        // A location older than this request belongs to an earlier one.
        if let time, time < requestedAt { return }
        timer?.cancel()
        gate.finish(p, token: token)
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        let p = Position(lat: l.coordinate.latitude, lon: l.coordinate.longitude, accuracyM: l.horizontalAccuracy)
        let time = l.timestamp
        Task { @MainActor in self.deliver(p, at: time) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        Task { @MainActor in self.deliver(nil, at: nil) }
    }
}
