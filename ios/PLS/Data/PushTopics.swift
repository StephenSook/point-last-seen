import FirebaseMessaging
import Foundation

/// Subscribing to the team's push topic (a seam for tests).
protocol PushTopics: Sendable {
    func subscribe(_ topic: String) async throws
    func unsubscribe(_ topic: String) async throws
}

/// Firebase Cloud Messaging topics. FCM refuses a subscription made before the phone has its
/// token (FIRMessagingTokenManager: "No APNS token specified before fetching FCM Token").
struct FirebasePushTopics: PushTopics {
    func subscribe(_ topic: String) async throws { try await Messaging.messaging().subscribe(toTopic: topic) }
    func unsubscribe(_ topic: String) async throws { try await Messaging.messaging().unsubscribe(fromTopic: topic) }
}
