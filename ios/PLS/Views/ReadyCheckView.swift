import SwiftUI

/// The Ready check: what must be true before the team leaves signal. Lines are filled in by
/// the pack, model and location tasks; until then each line says what it is waiting for.
struct ReadyCheckView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Training drill. Nobody is missing.")
                        .font(.headline)
                }
                Section("Before you leave signal") {
                    Label("Pack: not loaded yet", systemImage: "shippingbox")
                    Label("On-device model: checking", systemImage: "cpu")
                    Label("Location: not asked yet", systemImage: "location")
                }
            }
            .navigationTitle("Ready check")
        }
    }
}
