// ActivityKit's Activity predates Sendable; its update and end calls are async system calls, and
// this client only touches its one activity from the main actor.
@preconcurrency import ActivityKit
import Foundation
import PLSCore

/// Starts, updates and ends the Live Activity (a seam so the decisions are testable).
@MainActor
protocol LiveActivityClient: AnyObject {
    /// False when Live Activities are off or the system refuses; the controller tries again later.
    func start(teamId: String, state: TaskActivityAttributes.ContentState) -> Bool
    func update(_ state: TaskActivityAttributes.ContentState)
    func end()
}

/// Keeps one Live Activity in step with the loaded pack and the report journal: started when a
/// pack is loaded, updated only when what it shows changes, ended when the pack is gone.
@MainActor
final class TaskActivityController {
    private let client: LiveActivityClient
    private var runningTeam: String?
    private var last: TaskActivityAttributes.ContentState?

    init(client: LiveActivityClient = ActivityKitClient()) {
        self.client = client
    }

    func sync(teamId: String?, status: TaskStatus?, night: Bool) {
        guard let teamId, let status else {
            if runningTeam != nil { client.end() }
            runningTeam = nil
            last = nil
            return
        }
        let state = TaskActivityAttributes.ContentState(status: status, night: night)
        if let running = runningTeam, running != teamId {
            client.end()
            runningTeam = nil
        }
        if runningTeam == nil {
            if client.start(teamId: teamId, state: state) {
                runningTeam = teamId
                last = state
            }
        } else if state != last {
            client.update(state)
            last = state
        }
    }
}

/// The real client, on ActivityKit.
@MainActor
final class ActivityKitClient: LiveActivityClient {
    private var activity: Activity<TaskActivityAttributes>?

    func start(teamId: String, state: TaskActivityAttributes.ContentState) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        // One task at a time: end any left over from an earlier run of the app.
        for old in Activity<TaskActivityAttributes>.activities {
            Task { await old.end(nil, dismissalPolicy: .immediate) }
        }
        do {
            activity = try Activity.request(attributes: TaskActivityAttributes(teamId: teamId),
                                            content: ActivityContent(state: state, staleDate: nil))
            return true
        } catch {
            return false
        }
    }

    func update(_ state: TaskActivityAttributes.ContentState) {
        guard let activity else { return }
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
