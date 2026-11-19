import FirebaseMessaging
import Foundation

/// Subscribing to the team's push topic (a seam for tests).
protocol PushTopics: Sendable {
    func subscribe(_ topic: String) async throws
    func unsubscribe(_ topic: String) async throws
}

/// Firebase Cloud Messaging topics. FCM holds a subscription until the phone has its token.
struct FirebasePushTopics: PushTopics {
    func subscribe(_ topic: String) async throws { try await Messaging.messaging().subscribe(toTopic: topic) }
    func unsubscribe(_ topic: String) async throws { try await Messaging.messaging().unsubscribe(fromTopic: topic) }
}
