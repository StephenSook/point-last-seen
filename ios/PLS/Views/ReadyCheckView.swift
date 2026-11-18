import PLSCore
import SwiftUI

/// The Ready check: what must be true before the team leaves signal, each line from the real
/// state of this phone. Drawn in theme colours only, on plain black rows.
struct ReadyCheckView: View {
    @Bindable var model: AppModel
    @Environment(ThemeStore.self) private var themeStore
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Training drill. Nobody is missing.").font(.headline)
                if let profile = model.mission?.sharedProfile, let notes = try? BundledConstants.approachNotes() {
                    section("How to approach them") {
                        ApproachCardView(card: ApproachCard.build(profile: profile, notes: notes))
                    }
                }
                section("Screen") {
                    FieldChoice(options: [("Auto", ThemeMode.auto), ("Day", .day), ("Night", .night)],
                                selection: Bindable(themeStore).mode, hint: "Screen colours. Auto turns red at dusk.")
                }
                section("Before you leave signal") {
                    row(model.signedIn ? "Signed in" : "Not signed in. Stay in signal.", icon: "person.badge.key")
                    row(model.mission == nil ? "Pack: not loaded" : "Pack: loaded", icon: "shippingbox")
                    row(ModelSessionFactory.unavailableReason() ?? "On-device model: ready (\(ModelSessionFactory.onDeviceStatus().variant))",
                        icon: "cpu")
                    Button { model.location.requestPermission() } label: {
                        Label("Allow location", systemImage: "location").frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.accentColor)
                    Toggle("Allow cloud reading when the phone cannot read a report", isOn: $model.cloudConsent)
                        .toggleStyle(FieldToggleStyle())
                }
            }
            .padding()
        }
        .background(theme.backgroundColor)
        .fieldNavigation("Ready check")
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title3.bold()).foregroundStyle(theme.text(.secondary)).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func row(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .overlay(alignment: .bottom) { Rectangle().fill(theme.lineColor).frame(height: 2) }
    }
}
