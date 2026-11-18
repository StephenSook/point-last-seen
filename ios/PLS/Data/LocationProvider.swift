import CoreLocation
import Foundation
import PLSCore

/// One Core Location fix with a timeout. No fix (airplane mode under cover, or no permission)
/// returns nil, and the report then takes its segment from the team's assignment.
@MainActor
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var pending: CheckedContinuation<Position?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestPermission() { manager.requestWhenInUseAuthorization() }

    /// Waits at most `timeout` seconds (spike S-GPS sets the field value).
    func fix(timeout: TimeInterval = 30) async -> Position? {
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways,
              pending == nil else { return nil }
        return await withCheckedContinuation { c in
            pending = c
            manager.requestLocation()
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(timeout))
                self?.finish(nil)
            }
        }
    }

    private func finish(_ p: Position?) {
        pending?.resume(returning: p)
        pending = nil
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        let p = Position(lat: l.coordinate.latitude, lon: l.coordinate.longitude, accuracyM: l.horizontalAccuracy)
        Task { @MainActor in self.finish(p) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        Task { @MainActor in self.finish(nil) }
    }
}
