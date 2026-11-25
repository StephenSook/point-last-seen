import PLSCore
import SwiftUI

struct RootView: View {
    @State private var model = AppModel()
    @State private var themeStore = ThemeStore()
    @State private var activities = TaskActivityController()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path = NavigationPath()

    enum Route: Hashable { case readyCheck, map }

    var body: some View {
        // Re-checked each minute so Auto turns to night at civil dusk without a restart.
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let theme = themeStore.tokens(at: context.date,
                                          place: ThemeStore.place(lastFix: model.lastFix, grid: model.mission?.grid ?? []))
            NavigationStack(path: $path) {
                TaskView(model: model)
                    .modifier(TaskLinks(hasMission: model.mission != nil))
                    .navigationDestination(for: Route.self) { route in
                        switch route {
                        case .readyCheck: ReadyCheckView(model: model)
                        case .map:
                            if let mission = model.mission {
                                SearchMapScreen(mission: mission, posterior: model.posterior)
                            } else {
                                ContentUnavailableView("No mission loaded", systemImage: "map", description: Text(TaskView.noMissionHint))
                            }
                        }
                    }
            }
            .environment(\.fieldTheme, theme)
            .environment(themeStore)
            .tint(theme.accentColor)
            .foregroundStyle(theme.text(.primary))
            .font(.title3.weight(.semibold))           // the field floor: Title 3, semibold or heavier
            .background(theme.backgroundColor.ignoresSafeArea())
            .preferredColorScheme(.dark)
            .onChange(of: ActivityInput(teamId: model.mission?.teamId, status: model.taskStatus, night: theme == FieldTheme.night),
                      initial: true) { _, input in
                activities.sync(teamId: input.teamId, status: input.status, night: input.night)
            }
            // Each minute in front: put back a lock-screen card iOS ended meanwhile, for example between the
            // check and an update it then ignored.
            .onChange(of: context.date) { _, _ in activities.refresh() }
        }
        .task {
            model.start()
            PushInbox.shared.attach { payload in Task { await model.openedPush(payload) } }
            PushInbox.shared.attachToken { model.pushTokenArrived() }
        }
        // A tapped push opens the task, from wherever the searcher was.
        // A tapped push shows the task, unless the account changed since the request was made.
        .onChange(of: model.openTaskRequests) { _, _ in if model.openTaskStillCurrent { path = NavigationPath() } }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            model.becameActive()
            // Puts back a lock-screen card iOS ended while the app was away (its 8-hour limit).
            activities.refresh()
        }
    }
}

/// The task screen's links in the navigation bar: Map (while a mission is loaded) and Ready check.
struct TaskLinks: ViewModifier {
    let hasMission: Bool

    func body(content: Content) -> some View {
        content.toolbar {
            if hasMission {
                NavigationLink("Map", value: RootView.Route.map)
            }
            NavigationLink("Ready check", value: RootView.Route.readyCheck)
        }
    }
}

/// What the Live Activity depends on.
private struct ActivityInput: Equatable {
    var teamId: String?
    var status: TaskStatus?
    var night: Bool
}
