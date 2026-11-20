import PLSCore
import SwiftUI

/// One sent report: what was said, what the phone made of it, who read it, and whether it
/// reached the server.
struct ReportEchoView: View {
    @Environment(\.fieldTheme) private var theme
    @AppStorage("pls.showSources") private var showSources = false
    let entry: OutboxEntry
    /// The practice drill: lines that say to ask command say so for a real search.
    var practice = false
    let retry: () -> Void
    var canUndo = false
    var undo: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let raw = entry.doc.rawText {
                Text(raw).font(.title3.weight(.semibold))
            }
            if entry.doc.route?.stage == .evidenceProtocol {
                EvidenceProtocolView()
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let route = entry.doc.route { RouteGlyph(mark: RouteMark.make(route)) }
                    Text(EchoText.effectLine(entry.doc.effect, type: entry.doc.type, practice: practice)).font(.title3.weight(.semibold))
                }
                // Proof is a glyph; the sentence is for filming and judges only.
                if showSources, let route = entry.doc.route {
                    Text(EchoText.routeLine(route)).font(.title3.weight(.semibold)).foregroundStyle(theme.text(.secondary))
                }
            }
            HStack {
                Text(EchoText.deliveryLine(entry.state)).font(.title3.bold())
                Spacer()
                if canUndo {
                    Button("Undo", action: undo).buttonStyle(.bordered).frame(minHeight: 60)
                        .accessibilityHint("Takes this report back. Works for 5 seconds after sending.")
                }
                if case let .rejected(reason) = entry.state, Outbox.isRetryable(reason: reason) {
                    Button("Retry", action: retry).buttonStyle(.bordered)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
