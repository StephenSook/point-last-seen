import SwiftUI

/// The Ready check: what must be true before the team leaves signal, each line from the real
/// state of this phone.
struct ReadyCheckView: View {
    @Bindable var model: AppModel

    var body: some View {
        List {
            Section {
                Text("Training drill. Nobody is missing.").font(.headline)
            }
            Section("Before you leave signal") {
                Label(model.mission == nil ? "Pack: not loaded" : "Pack: loaded", systemImage: "shippingbox")
                Label(ModelSessionFactory.unavailableReason() ?? "On-device model: ready (\(ModelSessionFactory.onDeviceStatus().variant))",
                      systemImage: "cpu")
                Button("Allow location") { model.location.requestPermission() }
                Toggle("Allow cloud reading when the phone cannot read a report", isOn: $model.cloudConsent)
            }
        }
        .navigationTitle("Ready check")
    }
}
