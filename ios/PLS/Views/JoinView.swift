import SwiftUI

/// Joining the search: the code and the team command gave. The incident id is needed only when
/// command names one; it stays folded away otherwise.
struct JoinView: View {
    static let title = "Join your team"
    static let codeLabel = "Join code"
    static let teamLabel = "Team, for example T1"
    static let retryLabel = "Read the mission again"

    @Bindable var model: AppModel
    @Environment(\.fieldTheme) private var theme
    @State private var code = ""
    @State private var team = ""
    @State private var incident = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(Self.codeLabel, text: $code)
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
                .font(.title2.monospaced()).accessibilityIdentifier("join-code")
            TextField(Self.teamLabel, text: $team)
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
                .font(.title3).accessibilityIdentifier("join-team")
            DisclosureGroup("Incident id") {
                TextField("Only if command gave one", text: $incident)
                    .autocorrectionDisabled().textInputAutocapitalization(.never)
                    .font(.title3).accessibilityIdentifier("join-incident")
            }
            .font(.title3)
            Button {
                Task { await model.join(code: code, teamId: team, incidentId: incident) }
            } label: {
                Text(model.joining ? "Joining..." : "Join").font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 60)
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.backgroundColor)
            .background(theme.accentColor, in: RoundedRectangle(cornerRadius: 12))
            .disabled(model.joining)
            .accessibilityIdentifier("join-button")
            if let message = model.joinMessage {
                Text(message).font(.title3).accessibilityIdentifier("join-message")
            }
            if model.canRetryMission {
                // Already in the incident: read the mission again without the code.
                Button(Self.retryLabel) { Task { await model.retryMission() } }
                    .font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 60)
                    .disabled(model.joining)
                    .accessibilityIdentifier("join-retry-mission")
            }
        }
        .textFieldStyle(.roundedBorder)
    }
}
