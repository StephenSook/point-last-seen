import PLSCore
import SwiftUI

/// One sent report: what was said, what the phone made of it, who read it, and whether it
/// reached the server.
struct ReportEchoView: View {
    let entry: OutboxEntry
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let raw = entry.doc.rawText {
                Text(raw).font(.body)
            }
            if entry.doc.route?.stage == .evidenceProtocol {
                EvidenceProtocolView()
            } else {
                Text(EchoText.effectLine(entry.doc.effect, type: entry.doc.type)).font(.headline)
                if let route = entry.doc.route {
                    Text(EchoText.routeLine(route)).font(.footnote).foregroundStyle(.secondary)
                }
            }
            HStack {
                Text(EchoText.deliveryLine(entry.state)).font(.footnote.bold())
                Spacer()
                if case let .rejected(reason) = entry.state, reason != Outbox.conflictReason {
                    Button("Retry", action: retry).buttonStyle(.bordered)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
