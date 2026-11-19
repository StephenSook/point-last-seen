import SwiftUI

enum AlertOffer {
    static let sentence = "Turn on alerts so a new assignment reaches you on a locked screen."
    static let allow = "Turn on alerts"
    static let later = "Not now"
}

/// Asked once, after the first join: why alerts help, and two answers.
struct AlertOfferView: View {
    let model: AppModel
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(AlertOffer.sentence).font(.title3.weight(.semibold))
            HStack(spacing: 12) {
                Button(AlertOffer.allow) { Task { await model.answerAlerts(true) } }
                    .font(.title3.bold()).foregroundStyle(theme.onAccentColor)
                    .padding(12).background(theme.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("alerts-allow")
                Button(AlertOffer.later) { Task { await model.answerAlerts(false) } }
                    .font(.title3).accessibilityIdentifier("alerts-later")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
