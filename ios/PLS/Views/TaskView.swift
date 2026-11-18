import PLSCore
import SwiftUI

/// The field screen: the Report bar, the typed or dictated report, and the sent reports.
/// Tapping the bar focuses the field with the system keyboard, whose microphone key is in view;
/// the app itself calls no speech API.
struct TaskView: View {
    @Bindable var model: AppModel
    @State private var text = ""
    @State private var dictated = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Training drill. Nobody is missing.").font(.headline)
            if let mission = model.mission {
                Text("Your segments: \(mission.assignedSegmentIds.joined(separator: ", "))")
                Text("Your assignment changes only when command approves.").font(.footnote)
                Button { focused = true } label: {
                    Text("Report").font(.largeTitle.bold()).frame(maxWidth: .infinity, minHeight: 120)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityHint("Opens the keyboard. Tap the microphone key to dictate.")
                TextField("Say or type what you found", text: $text, axis: .vertical)
                    .focused($focused)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...6)
                Button("Send") {
                    let report = text
                    text = ""
                    focused = false
                    Task { await model.send(report, inputMethod: .typed) }
                }
                .buttonStyle(.bordered)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.sending)
                if let problem = model.problem {
                    Text(problem).font(.footnote).foregroundStyle(.red)
                }
                List(model.store?.entries.reversed() ?? [], id: \.eventId) { entry in
                    ReportEchoView(entry: entry) { model.retry(entry.eventId) }
                }
                .listStyle(.plain)
            } else {
                ContentUnavailableView("No pack loaded", systemImage: "shippingbox",
                                       description: Text("Load your team's pack at the Ready check before you leave signal."))
            }
        }
        .padding()
    }
}
