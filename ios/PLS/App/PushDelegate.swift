import FirebaseMessaging
import PLSCore
import UIKit
import UserNotifications

/// Holds a tapped push until the app is ready to open it (a tap can launch the app).
@MainActor
final class PushInbox {
    static let shared = PushInbox()
    private var handler: ((PushPayload) -> Void)?
    private var pending: [PushPayload] = []

    func receive(_ payload: PushPayload) {
        if let handler { handler(payload) } else { pending.append(payload) }
    }

    func attach(_ handler: @escaping (PushPayload) -> Void) {
        self.handler = handler
        let waiting = pending
        pending = []
        waiting.forEach(handler)
    }
}

/// Hands the APNs token to Firebase Messaging and routes a tapped new-assignment push, by its ids
/// only, to the app.
final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    /// In the foreground the plan listener already shows and speaks the new assignment.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.list]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let payload = PushPayload(userInfo: response.notification.request.content.userInfo) else { return }
        await MainActor.run { PushInbox.shared.receive(payload) }
    }
}
