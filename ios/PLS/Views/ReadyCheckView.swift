import PLSCore
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
            if let profile = model.mission?.sharedProfile, let notes = try? BundledConstants.approachNotes() {
                Section("How to approach them") {
                    ApproachCardView(card: ApproachCard.build(profile: profile, notes: notes))
                }
            }
            Section("Before you leave signal") {
                Label(model.signedIn ? "Signed in" : "Not signed in. Stay in signal.", systemImage: "person.badge.key")
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
