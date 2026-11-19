import FirebaseCore
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

    private var tokenHandler: (() -> Void)?
    private var tokenWaiting = false

    /// Messaging has its registration token: subscriptions refused before it can now go through.
    func tokenArrived() {
        if let tokenHandler { tokenHandler() } else { tokenWaiting = true }
    }

    func attachToken(_ handler: @escaping () -> Void) {
        tokenHandler = handler
        if tokenWaiting {
            tokenWaiting = false
            handler()
        }
    }
}

/// Hands the APNs token to Firebase Messaging, passes on Messaging's own token, and routes a tapped
/// new-assignment push, by its ids only, to the app.
final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Only when Firebase is configured (a build without its settings file starts no Firebase).
        if FirebaseApp.app() != nil { Messaging.messaging().delegate = self }
        return true
    }

    /// FCM refuses a topic subscription made before the phone has its token and does not retry it,
    /// so the app follows its team's topic again once the token is here.
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard fcmToken != nil else { return }
        Task { @MainActor in PushInbox.shared.tokenArrived() }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    /// In the foreground nothing is shown, so the push's own words never appear in the app's
    /// Notification Center list: the plan listener already shows and speaks the new assignment.
    nonisolated static let foregroundPresentation: UNNotificationPresentationOptions = []

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        Self.foregroundPresentation
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let payload = PushPayload(userInfo: response.notification.request.content.userInfo) else { return }
        await MainActor.run { PushInbox.shared.receive(payload) }
    }
}
