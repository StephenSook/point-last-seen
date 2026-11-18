import SwiftUI

struct RootView: View {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            TaskView(model: model)
                .toolbar {
                    NavigationLink("Ready check") { ReadyCheckView(model: model) }
                }
        }
        .task { model.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.becameActive() }
        }
    }
}
