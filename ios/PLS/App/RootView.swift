import PLSCore
import SwiftUI

struct RootView: View {
    @State private var model = AppModel()
    @State private var themeStore = ThemeStore()
    @State private var activities = TaskActivityController()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path = NavigationPath()

    enum Route: Hashable { case readyCheck }

    var body: some View {
        // Re-checked each minute so Auto turns to night at civil dusk without a restart.
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let theme = themeStore.tokens(at: context.date,
                                          place: ThemeStore.place(lastFix: model.lastFix, grid: model.mission?.grid ?? []))
            NavigationStack(path: $path) {
                TaskView(model: model)
                    .toolbar {
                        NavigationLink("Ready check", value: Route.readyCheck)
                    }
                    .navigationDestination(for: Route.self) { _ in ReadyCheckView(model: model) }
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
        }
        .task {
            model.start()
            PushInbox.shared.attach { payload in Task { await model.openedPush(payload) } }
        }
        // A tapped push opens the task, from wherever the searcher was.
        .onChange(of: model.openTaskRequests) { _, _ in path = NavigationPath() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.becameActive() }
        }
    }
}

/// What the Live Activity depends on.
private struct ActivityInput: Equatable {
    var teamId: String?
    var status: TaskStatus?
    var night: Bool
}
