import SwiftUI

/// Shown when a report may be evidence of a crime. No model read it; command sees the plain text.
struct EvidenceProtocolView: View {
    @Environment(\.fieldTheme) private var theme
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Do not touch. Hold the line. Call it in.")
                .font(.title3.bold())
            Text("Not sent to any model.")
                .font(.footnote)
                .foregroundStyle(theme.text(.secondary))
        }
        .accessibilityElement(children: .combine)
    }
}
