import SwiftUI

/// "Cold raises urgency" or "Cool and wet raises urgency": search urgency only, never treatment
/// advice. The CDC sentence it rests on sits under it, word for word.
struct UrgencyChip: View {
    let text: String
    let source: String
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(text, systemImage: "thermometer.snowflake")
                .font(.title3.bold())
                .foregroundStyle(theme.onAccentColor)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(theme.accentColor, in: Capsule())
            Text(source).font(.title3.weight(.semibold)).foregroundStyle(theme.text(.secondary))
        }
        .accessibilityElement(children: .combine)
    }
}
