import PLSCore
import SwiftUI

/// The header's link state: shape and count, never colour alone; the words go to VoiceOver.
struct LinkGlyph: View {
    let state: LinkState
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        HStack(spacing: 4) {
            if state.symbol == "tray.and.arrow.up" {
                Image(systemName: "antenna.radiowaves.left.and.right.slash")      // no link, reports waiting
            }
            Image(systemName: state.symbol)
            if let n = state.badge {
                Text("\(n)").font(.title3.bold()).monospacedDigit()
                    .padding(.horizontal, 6)
                    .foregroundStyle(theme.onAccentColor)
                    .background(theme.text(.primary), in: Capsule())
            }
        }
        .font(.title3.weight(.semibold))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.label)
    }
}

/// Where a report was read: a phone, a cloud, the phone's rules, or a raised hand when no model saw it.
struct RouteGlyph: View {
    let mark: RouteMark

    var body: some View {
        Image(systemName: mark.symbol)
            .font(.title3.weight(.semibold))
            .accessibilityLabel(mark.label)
    }
}

/// The field header: the team's segments, the drill tag and the link glyph.
struct DrillBanner: View {
    let segments: String
    let link: LinkState
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        HStack(spacing: 12) {
            Text(segments).font(.title2.bold()).foregroundStyle(theme.accentColor)
                .accessibilityLabel("Your segments: \(segments)")
            Text("DRILL").font(.title3.bold())
                .padding(.horizontal, 8)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(theme.text(.primary), lineWidth: 2))
                .accessibilityLabel("Training drill")
            Spacer()
            LinkGlyph(state: link)
        }
        .frame(minHeight: 44)
    }
}
