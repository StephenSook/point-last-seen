import PLSCore
import SwiftUI

/// The Ready check: what must be true before the team leaves signal, each line from the real
/// state of this phone. Drawn in theme colours only, on plain black rows.
struct ReadyCheckView: View {
    static let cloudLabel = "Allow cloud reading"
    /// What leaves the phone, and when: exactly what the cloud read sends (report text, the two
    /// segment tools, the profile tool).
    static let cloudDetail = "Only when this phone cannot read a report. Google's model then gets the report's words (phone numbers removed), "
        + "the segment you are in, your team's segments, and the person's description: clothing, appearance, height, hair "
        + "and mobility aids."

    @Bindable var model: AppModel
    @Environment(ThemeStore.self) private var themeStore
    @Environment(\.fieldTheme) private var theme
    @AppStorage("pls.showSources") private var showSources = false
    @State private var confirmingLeave = false
    @State private var leaveRefused = false

    static let leaveLabel = "Leave this search"
    static let endPracticeLabel = "End the practice drill"
    static let endPracticeDetail = "Its reports are deleted from this phone. You can then join a search or start the practice drill again."
    static let leaveDetail = "This phone stops getting this team's tasks and its sign-in is deleted, so it can join another search. Reports already sent stay with command."

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Training drill. Nobody is missing.").font(.title3.weight(.semibold))
                if model.mission == nil {
                    section(JoinView.title) { JoinView(model: model) }
                }
                if model.urgency != .none || model.mission?.sharedProfile != nil {
                    section("How to approach them") {
                        if let text = model.urgency.chipText, let rule = try? BundledConstants.urgencyRule() {
                            UrgencyChip(text: text, source: rule.sourceLine)
                        }
                        if let profile = model.mission?.sharedProfile, let notes = try? BundledConstants.approachNotes() {
                            ApproachCardView(card: ApproachCard.build(profile: profile, notes: notes, aids: try? BundledConstants.trackingAids()))
                        }
                    }
                }
                section("Screen") {
                    FieldChoice(options: [("Auto", ThemeMode.auto), ("Day", .day), ("Night", .night)],
                                selection: Bindable(themeStore).mode, hint: "Screen colours. Auto turns red at dusk.")
                }
                section("Show sources") {
                    Toggle("Say in words where each report was read (for filming)", isOn: $showSources)
                        .toggleStyle(FieldToggleStyle())
                }
                section("Before you leave signal") {
                    if let signIn = model.signInLine { row(signIn, icon: "person.badge.key") }
                    row(model.mission == nil ? "Pack: not loaded" : "Pack: loaded", icon: "shippingbox")
                    row(model.updatePrompt ?? "App version \(model.appVersion): current", icon: "arrow.down.app")
                    row(ModelSessionFactory.unavailableReason() ?? "On-device model: ready (\(ModelSessionFactory.onDeviceStatus().variant))",
                        icon: "cpu")
                    Button { model.location.requestPermission() } label: {
                        Label("Allow location", systemImage: "location").frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.accentColor)
                    Toggle(Self.cloudLabel, isOn: $model.cloudConsent)
                        .toggleStyle(FieldToggleStyle())
                    Text(Self.cloudDetail).font(.title3).foregroundStyle(theme.text(.secondary))
                }
                if model.offersLeave {
                    let inPractice = model.mission?.isPractice == true
                    let leaveTitle = inPractice ? Self.endPracticeLabel : Self.leaveLabel
                    section(leaveTitle) {
                        Button { confirmingLeave = true } label: {
                            Label(leaveTitle, systemImage: "rectangle.portrait.and.arrow.right")
                                .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(theme.accentColor)
                        .accessibilityIdentifier("leave-search")
                        if leaveRefused, let reason = model.leaveRefusal {
                            Text(reason).font(.title3.weight(.semibold))
                        }
                    }
                    .confirmationDialog(leaveTitle, isPresented: $confirmingLeave, titleVisibility: .visible) {
                        Button(inPractice ? "End" : "Leave", role: .destructive) {
                            Task { leaveRefused = !(await model.leaveSearch()) }
                        }
                        Button("Stay", role: .cancel) {}
                    } message: {
                        Text(inPractice ? Self.endPracticeDetail : Self.leaveDetail)
                    }
                }
                if model.canRouteCheck {
                    section("Route check") {
                        NavigationLink("Check both read routes") { RouteCheckView(model: model) }
                            .accessibilityIdentifier("route-check-link")
                    }
                }
                #if DEBUG
                section("Eval") {
                    NavigationLink("Report-reading eval") { EvalView(model: model) }
                        .accessibilityIdentifier("eval-link")
                }
                #endif
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
