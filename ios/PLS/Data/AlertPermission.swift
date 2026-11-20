import Foundation
import UIKit
import UserNotifications

enum AlertState: Sendable { case notAsked, allowed, refused }

/// iOS notification permission and remote registration (a seam for tests).
protocol AlertPermission: Sendable {
    func current() async -> AlertState
    /// Shows the system question; true when alerts were allowed.
    func request() async -> Bool
    /// Asks iOS for the APNs token, which is handed to Firebase Messaging when it arrives.
    func registerForPushes() async
}

struct SystemAlerts: AlertPermission {
    func current() async -> AlertState {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .notDetermined: .notAsked
        case .denied: .refused
        default: .allowed
        }
    }

    func request() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func registerForPushes() async {
        await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
    }
}
