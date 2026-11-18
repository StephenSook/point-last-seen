import PLSCore
import SwiftUI

/// The field screen: the Report bar, the typed or dictated report, and the sent reports.
/// Tapping the bar focuses the field with the system keyboard, whose microphone key is in view;
/// the app itself calls no speech API.
struct TaskView: View {
    @Bindable var model: AppModel
    @State private var text = ""
    @FocusState private var focused: Bool
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Training drill. Nobody is missing.").font(.title3.weight(.semibold))
            if let prompt = model.updatePrompt {
                Label(prompt, systemImage: "arrow.down.app.fill").font(.title3.weight(.semibold))
                    .foregroundStyle(theme.onAccentColor)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.accentColor, in: RoundedRectangle(cornerRadius: 12))
            }
            if let mission = model.mission {
                Text("Your segments: \(mission.assignedSegmentIds.joined(separator: ", "))")
                Text("Your assignment changes only when command approves.").font(.title3.weight(.semibold))
                    .foregroundStyle(theme.text(.secondary))
                Button { focused = true } label: {
                    Text("Report").font(.largeTitle.bold()).frame(maxWidth: .infinity, minHeight: 120)
                        .foregroundStyle(theme.onAccentColor)
                        .background(theme.accentColor, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the keyboard. Tap the microphone key to dictate.")
                TextField("Say or type what you found", text: $text, axis: .vertical)
                    .focused($focused)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...6)
                Button("Send") {
                    let report = text
                    focused = false
                    Task { text = await model.submit(report, inputMethod: .typed) }
                }
                .buttonStyle(.bordered)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.sending)
                if model.sending {
                    ProgressView("Reading your report")
                }
                if let problem = model.problem {
                    Label(problem, systemImage: "exclamationmark.triangle.fill").font(.title3.bold())
                        .foregroundStyle(theme.text(.primary))
                }
                List(model.store?.entries.reversed() ?? [], id: \.eventId) { entry in
                    ReportEchoView(entry: entry) { model.retry(entry.eventId) }
                        .listRowBackground(theme.backgroundColor)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            } else {
                ContentUnavailableView("No pack loaded", systemImage: "shippingbox",
                                       description: Text("Load your team's pack at the Ready check before you leave signal."))
            }
        }
        .padding()
        // The "Log report" control (Action button) asks for the Report field.
        .task(id: ReportFocus.shared.pending) {
            if ReportFocus.shared.take(), model.mission != nil { focused = true }
        }
    }
}
