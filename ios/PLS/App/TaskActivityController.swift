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
    /// Asks iOS to remove this app's cards: the one it started and any an earlier run left.
    func end()
    /// False once the started card is gone or ended. iOS ends a Live Activity after 8 hours and a person can
    /// remove it; an update to an ended card changes nothing on the lock screen.
    var isRunning: Bool { get }
    /// True while any card of this app is listed, its own or one an earlier run left.
    var hasCards: Bool { get }
    /// What the cards an earlier run of the app left on the lock screen show, by team.
    func leftovers() -> [String: TaskActivityAttributes.ContentState]
}

/// Keeps one Live Activity in step with the loaded pack and the report journal: started when a
/// pack is loaded, updated only when what it shows changes, ended when the pack is gone, and
/// started again when iOS ended it (so the lock screen never keeps an old segment from a card
/// the app can no longer update).
@MainActor
final class TaskActivityController {
    private let client: LiveActivityClient
    private var runningTeam: String?
    private var last: TaskActivityAttributes.ContentState?
    /// The team `last` was shown for.
    private var lastTeam: String?
    /// The cards an earlier run left, read when this controller is made (before any is ended), so a fresh card
    /// with the same content keeps their time. Forgotten once this run puts up a card.
    private var leftover: [String: TaskActivityAttributes.ContentState]
    private var input: (teamId: String?, status: TaskStatus?, night: Bool)?
    private let now: () -> Date

    init(client: LiveActivityClient = ActivityKitClient(), now: @escaping () -> Date = Date.init) {
        self.client = client
        self.now = now
        leftover = client.leftovers()
    }

    /// The app came to the front: put back a card iOS ended meanwhile, also when nothing it shows changed.
    func refresh() {
        guard let input else { return }
        sync(teamId: input.teamId, status: input.status, night: input.night)
    }

    func sync(teamId: String?, status: TaskStatus?, night: Bool) {
        input = (teamId, status, night)
        guard let teamId, let status else {
            // Also a card an earlier run left: the searcher may have been taken off the team while the app was away.
            if runningTeam != nil || client.hasCards { client.end() }
            runningTeam = nil
            last = nil
            lastTeam = nil
            return
        }
        // The card shows when its content was set. New segments or a new report count take the time now. The
        // same content keeps its time: a change of colours at dusk, and a fresh card that only replaces one iOS
        // ended or one an earlier run left (the app may be offline then, so now would claim a check it did not make).
        let previous = lastTeam == teamId ? last : leftover[teamId]
        let sameContent = previous?.status == status
        // A card a build without the time left has an unknown time: the same content then shows no time.
        let state = TaskActivityAttributes.ContentState(status: status, night: night,
                                                       setAt: sameContent ? previous?.setAt : now())
        // Another team, or a card iOS ended: ask iOS to remove the old card (an ended one stays on the lock
        // screen for up to 4 hours) and start a fresh one. In the background iOS refuses the start, and the
        // next sync tries again.
        if let running = runningTeam, running != teamId || !client.isRunning {
            client.end()
            runningTeam = nil
        }
        if runningTeam == nil {
            if client.start(teamId: teamId, state: state) {
                runningTeam = teamId
                last = state
                lastTeam = teamId
                leftover = [:]
            }
        } else if let last, last.status != status || last.night != night {
            client.update(state)
            self.last = state
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

    /// Read from the system's list, by id: an activity that iOS ended or a person removed is either gone
    /// from it or no longer active there.
    var isRunning: Bool {
        guard let activity,
              let current = Activity<TaskActivityAttributes>.activities.first(where: { $0.id == activity.id }) else { return false }
        return current.activityState == .active || current.activityState == .stale
    }

    var hasCards: Bool { activity != nil || !Activity<TaskActivityAttributes>.activities.isEmpty }

    func leftovers() -> [String: TaskActivityAttributes.ContentState] {
        var cards: [String: TaskActivityAttributes.ContentState] = [:]
        for card in Activity<TaskActivityAttributes>.activities { cards[card.attributes.teamId] = card.content.state }
        return cards
    }

    /// Ends this client's card and every other card of this app still listed (one an earlier run left).
    func end() {
        let mine = activity
        activity = nil
        var asked = Set<String>()
        for card in Activity<TaskActivityAttributes>.activities {
            asked.insert(card.id)
            Task { await card.end(nil, dismissalPolicy: .immediate) }
        }
        if let mine, !asked.contains(mine.id) { Task { await mine.end(nil, dismissalPolicy: .immediate) } }
    }
}
