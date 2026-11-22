import PLSCore
import SwiftUI

/// Report a problem: the searcher flags the team's task or the family's description of the person to command. One
/// reason, an optional note (phone numbers are removed before it is sent), and Send; the line under it says what
/// became of the report.
struct ReportProblemView: View {
    static let title = "Report a problem"
    static let lead = "Command sees what you flag and why."
    static let noteHint = "Optional, up to 500 characters. Phone numbers are removed before it is sent."
    static let linkLabel = "Report a problem"

    @Bindable var model: AppModel
    @Environment(\.fieldTheme) private var theme
    @State var target: ContentReport.Target
    @State private var reason: ContentReport.Reason?
    @State private var note = ""
    @State private var sending = false
    @State private var result: ReportProblemResult?
    @FocusState private var noteFocused: Bool
    /// The search and plan this form opened on, taken once: the report is about them.
    @State private var context: AppModel.ReportContext?

    /// What the report is about, in the words the screen shows.
    static func words(_ target: ContentReport.Target) -> String {
        switch target {
        case .task: "Your task"
        case .familyDescription: "The family's description"
        case .event: "A report"
        }
    }

    /// Once the server took it, or it waits on this phone for signal, Send does nothing more.
    private var done: Bool { result == .sent || result == .waiting }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(Self.lead).font(.title3).foregroundStyle(theme.text(.secondary))
                if model.reportTargets.count > 1 {
                    FieldChoice(options: model.reportTargets.map { (Self.words($0), $0) }, selection: $target,
                                hint: "What the report is about.")
                } else {
                    Text(Self.words(target)).font(.title3.weight(.semibold))
                }
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(ContentReport.Reason.allCases, id: \.self) { option in
                        let chosen = option == reason
                        Button { reason = option } label: {
                            Label(option.words, systemImage: chosen ? "largecircle.fill.circle" : "circle")
                                .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(chosen ? theme.accentColor : theme.text(.primary))
                        .accessibilityAddTraits(chosen ? .isSelected : [])
                        .accessibilityIdentifier("report-reason-\(option.rawValue)")
                    }
                }
                TextField("Note", text: $note, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...6)
                    .focused($noteFocused)
                    .onChange(of: note) { _, typed in
                        let kept = ContentReport.capped(typed)
                        if kept != typed { note = kept }
                    }
                    .accessibilityIdentifier("report-note")
                Text(Self.noteHint).font(.title3).foregroundStyle(theme.text(.secondary))
                Button {
                    guard let reason, let context else { return }
                    // The keyboard goes, so the line saying what became of the report shows.
                    noteFocused = false
                    sending = true
                    Task {
                        result = await model.reportProblem(about: target, in: context, reason: reason, note: note)
                        sending = false
                    }
                } label: {
                    Text(sending ? "Sending" : "Send").frame(maxWidth: .infinity, minHeight: 60)
                }
                .buttonStyle(.bordered)
                .disabled(reason == nil || context == nil || sending || done)
                .accessibilityIdentifier("report-send")
                if let result {
                    Text(result.line).font(.title3.weight(.semibold))
                        .accessibilityIdentifier("report-result")
                }
            }
            .padding()
        }
        .onAppear { if context == nil { context = model.reportContext } }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            // Return starts a new line in the note, so the keyboard has its own way to close.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { noteFocused = false }
                    .accessibilityIdentifier("report-note-done")
            }
        }
        .background(theme.backgroundColor)
        .fieldNavigation(Self.title)
    }
}

/// The link to Report a problem, about `target` first, shown only while there is something to report.
struct ReportProblemLink: View {
    @Bindable var model: AppModel
    let target: ContentReport.Target
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        if model.reportTargets.contains(target) {
            NavigationLink {
                ReportProblemView(model: model, target: target)
            } label: {
                Label(ReportProblemView.linkLabel, systemImage: "flag").frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.accentColor)
            .accessibilityIdentifier("report-problem-\(target.rawValue)")
        }
    }
}
