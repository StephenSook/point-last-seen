import ActivityKit
import PLSCore

/// The team's task on the lock screen and in the Dynamic Island (P-07): the drill label, the
/// assigned segments and the reports still on this phone. Nothing about the subject.
struct TaskActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: TaskStatus
        /// Drawn in the night colours when the app's screen is in night mode.
        var night: Bool
    }

    var teamId: String
}
