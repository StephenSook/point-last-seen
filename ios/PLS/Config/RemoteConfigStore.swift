import FirebaseRemoteConfig
import Foundation

/// Fetches Remote Config at start and listens for real-time updates, so a kill-switch flip or a
/// raised minimum version reaches the phone without a restart. Offline, the last activated
/// values (or the built-in defaults) stay in force.
@MainActor
final class RemoteConfigStore {
    private let remoteConfig = RemoteConfig.remoteConfig()
    private var registration: ConfigUpdateListenerRegistration?
    var onChange: ((RemoteConfigValues) -> Void)?

    func start() {
        remoteConfig.setDefaults(RemoteConfigValues.defaults.asStrings.mapValues { $0 as NSString })
        publish()
        Task {
            _ = try? await remoteConfig.fetchAndActivate()
            publish()
        }
        registration = remoteConfig.addOnConfigUpdateListener { [weak self] _, error in
            guard error == nil else { return }
            Task { @MainActor in
                guard let self else { return }
                _ = try? await self.remoteConfig.activate()
                self.publish()
            }
        }
    }

    var current: RemoteConfigValues {
        RemoteConfigValues.from { [remoteConfig] key in remoteConfig.configValue(forKey: key).stringValue }
    }

    private func publish() { onChange?(current) }
}
