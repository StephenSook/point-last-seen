import SwiftUI

struct RootView: View {
    @State private var model = AppModel()

    var body: some View {
        NavigationStack {
            TaskView(model: model)
                .toolbar {
                    NavigationLink("Ready check") { ReadyCheckView(model: model) }
                }
        }
        .task { model.start() }
    }
}
