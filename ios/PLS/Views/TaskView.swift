import PLSCore
import SwiftUI

/// The field screen: the Report bar, the typed or dictated report, and the sent reports.
/// Tapping the bar focuses the field with the system keyboard, whose microphone key is in view;
/// the app itself calls no speech API.
struct TaskView: View {
    static let noMissionHint = "Join your team at the Ready check before you leave signal."
    static let practiceNotice = "Practice drill with sample data. Nobody is missing. Reports stay on this phone."
    @Bindable var model: AppModel
    @State private var text = ""
    @FocusState private var focused: Bool
    @State private var picking = false
    @State private var photographing = false
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
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.sending || model.heldForReview == text)
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
                if model.sending {
                    ProgressView("Reading your report")
                }
                if let problem = model.problem {
                    Label(problem, systemImage: "exclamationmark.triangle.fill").font(.title3.bold())
                        .foregroundStyle(theme.text(.primary))
                }
                // Re-checked each second so the 5-second Undo goes away on time.
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    List(model.missionEntries.reversed(), id: \.eventId) { entry in
                        ReportEchoView(entry: entry, practice: model.mission?.isPractice == true, retry: { model.retry(entry.eventId) },
                                       canUndo: model.canUndo(entry.eventId), undo: { model.undo(entry.eventId) })
                            .listRowBackground(theme.backgroundColor)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            } else if let ended = model.endedSearch {
                // The search ended: the line says so, and its reports stay, read-only, so each shows what happened.
                Text(ended.line).font(.title3.bold()).foregroundStyle(theme.text(.primary))
                    .accessibilityIdentifier("search-ended")
                List(model.endedEntries.reversed(), id: \.eventId) { entry in
                    ReportEchoView(entry: entry, searchEnded: true, retry: {})
                        .listRowBackground(theme.backgroundColor)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            } else {
                ContentUnavailableView("No mission loaded", systemImage: "shippingbox", description: Text(Self.noMissionHint))
            }
        }
        .padding()
        // The "Log report" control (Action button) asks for the Report field.
        .task(id: ReportFocus.shared.pending) {
            if ReportFocus.shared.take(), model.mission != nil { focused = true }
        }
    }
}
