import PLSCore
import SwiftUI

/// The field screen: the Report bar, the typed or dictated report (`ReportComposer`), and the sent
/// reports. The app itself calls no speech API. The whole screen scrolls, and a report just put in the
/// journal is brought into view whole, so the searcher sees what the phone made of it.
struct TaskView: View {
    static let noMissionHint = "Join your team at the Ready check before you leave signal."
    static let practiceNotice = "Practice drill with sample data. Nobody is missing. Reports stay on this phone."
    @Bindable var model: AppModel
    /// Counts the "Log report" requests that found a mission loaded; each one focuses the report box.
    @State private var focusRequests = 0
    @State private var picking = false
    @State private var photographing = false
    /// The scroll view's bottom inset (the home indicator): a receipt brought into view ends above it.
    @State private var bottomInset: CGFloat = 0
    @Environment(\.fieldTheme) private var theme

    /// The scroll target that hangs below a receipt by the bottom inset.
    static func endMarker(_ eventId: String) -> String { "end-\(eventId)" }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content
            }
            // A scrolled line goes out of view at the bar's lower edge: none of it is drawn beside or
            // behind the Map and Ready check links, which float over the screen with no backing.
            .clipped()
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentInsets.bottom } action: { _, inset in bottomInset = inset }
            .onChange(of: model.lastSentEventId) { _, sent in
                guard let sent else { return }
                // The receipt joins the screen in this same update: scroll once it is laid out. The scroll lines
                // up the target with the scroll view's own bottom edge, under the home indicator, so the target
                // is a marker that hangs one inset below the receipt.
                Task { @MainActor in withAnimation { proxy.scrollTo(Self.endMarker(sent), anchor: .bottom) } }
            }
        }
        // The "Log report" control (Action button) asks for the Report field.
        .task(id: ReportFocus.shared.pending) {
            if ReportFocus.shared.take(), model.mission != nil { focusRequests += 1 }
        }
    }

    /// One receipt per report, newest first, each with its event id so the screen can scroll to it.
    private func receipts<Row: View>(_ entries: [OutboxEntry], row: @escaping (OutboxEntry) -> Row) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(entries.reversed(), id: \.eventId) { entry in
                Divider()
                row(entry)
                    .background(alignment: .bottom) {
                        Color.clear.frame(height: bottomInset)
                            .alignmentGuide(.bottom) { $0[.top] }
                            .id(Self.endMarker(entry.eventId))
                    }
            }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Training drill. Nobody is missing.").font(.title3.weight(.semibold))
            if let prompt = model.updatePrompt {
                Label(prompt, systemImage: "arrow.down.app.fill").font(.title3.weight(.semibold))
                    .foregroundStyle(theme.onAccentColor)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.accentColor, in: RoundedRectangle(cornerRadius: 12))
            }
            if model.offersAlerts { AlertOfferView(model: model) }
            if let mission = model.mission {
                DrillBanner(segments: mission.assignedSegmentIds.sorted().joined(separator: " "), link: model.linkState)
                if mission.isPractice {
                    Text(Self.practiceNotice).font(.title3.weight(.semibold))
                        .foregroundStyle(theme.text(.primary))
                        .accessibilityIdentifier("practice-notice")
                } else {
                    Text("Your assignment changes only when command approves.").font(.title3.weight(.semibold))
                        .foregroundStyle(theme.text(.secondary))
                }
                ReportComposer(model: model, focusRequests: focusRequests)
                Button { picking = true } label: {
                    Label("Pick instead of typing", systemImage: "hand.tap").frame(maxWidth: .infinity, minHeight: 60)
                }
                .buttonStyle(.bordered)
                .sheet(isPresented: $picking) {
                    PickListView(segments: mission.assignedSegmentIds.sorted()) { choice in
                        Task { _ = await model.submitPick(choice) }
                    }
                    .environment(\.fieldTheme, theme)
                }
                // Only where Apple's model can read a photo (iOS 27), in a drill that lets a model read.
                if model.canReadPhoto {
                    Button { photographing = true } label: {
                        Label("Photo of something found", systemImage: "camera").frame(maxWidth: .infinity, minHeight: 60)
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.sending)
                    .accessibilityIdentifier("photo-button")
                    .accessibilityHint("Takes a photo of an object. It is read on this phone and not kept.")
                    .fullScreenCover(isPresented: $photographing) {
                        PhotoPicker { image in Task { _ = await model.submitPhoto(image) } }.ignoresSafeArea()
                    }
                }
                // Flag the team's task to command (it shows only while command's plan gave one).
                ReportProblemLink(model: model, target: .task)
                if model.sending {
                    ProgressView("Reading your report")
                }
                if let problem = model.problem {
                    Label(problem, systemImage: "exclamationmark.triangle.fill").font(.title3.bold())
                        .foregroundStyle(theme.text(.primary))
                }
                receipts(model.missionEntries) { entry in
                    // Re-checked each second so the 5-second Undo goes away on time.
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        ReportEchoView(entry: entry, practice: model.mission?.isPractice == true, retry: { model.retry(entry.eventId) },
                                       canUndo: model.canUndo(entry.eventId), undo: { model.undo(entry.eventId) })
                    }
                }
            } else if let ended = model.endedSearch {
                // The search ended: the line says so, and its reports stay, read-only, so each shows what happened.
                Text(ended.line).font(.title3.bold()).foregroundStyle(theme.text(.primary))
                    .accessibilityIdentifier("search-ended")
                receipts(model.endedEntries) { entry in
                    ReportEchoView(entry: entry, searchEnded: true, refusedByTheEnd: model.refusalShowsTheEnd(entry.eventId), retry: {})
                }
            } else {
                ContentUnavailableView("No mission loaded", systemImage: "shippingbox", description: Text(Self.noMissionHint))
            }
        }
        .padding()
    }
}

/// The Report bar, the report box and Send. The words being typed live here, so a keystroke
/// redraws only this part, not the whole task screen with its receipts and its photo check.
/// Tapping the bar focuses the box with the system keyboard, whose microphone key is in view.
struct ReportComposer: View {
    @Bindable var model: AppModel
    /// Rises once per "Log report" request the task screen took; each rise focuses the box.
    let focusRequests: Int
    @State private var text = ""
    @FocusState private var focused: Bool
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
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
                .accessibilityIdentifier("task-report-text")
            Button("Send") {
                let report = text
                focused = false
                Task { text = await model.submit(report, inputMethod: .typed) }
            }
            .buttonStyle(.bordered)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.sending || model.heldForReview == text)
            .accessibilityIdentifier("task-send")
            // Kept because the team changed: sent again only once the searcher has checked the new task.
            if let held = model.heldForReview, held == text, !text.isEmpty {
                Button("Send to my new team") {
                    let report = text
                    focused = false
                    Task { text = await model.sendToNewTeam(report, inputMethod: .typed) }
                }
                .buttonStyle(.bordered)
                .disabled(model.sending)
                .accessibilityIdentifier("send-to-new-team")
            }
        }
        .onChange(of: focusRequests) { focused = true }
    }
}
