import PLSCore
import SwiftUI

/// Controls drawn only in theme colours, so nothing on screen turns white at night.

/// A switch: the track in the line colour, the knob in the text colour, the accent when on.
struct FieldToggleStyle: ToggleStyle {
    @Environment(\.fieldTheme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 16) {
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule().fill(configuration.isOn ? theme.accentColor : theme.backgroundColor)
                        .overlay(Capsule().stroke(theme.lineColor, lineWidth: 2))
                    Circle().fill(configuration.isOn ? theme.onAccentColor : theme.text(.secondary)).padding(5)
                }
                .frame(width: 64, height: 36)
            }
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
    }
}

/// One choice among a few, as large buttons (gloves): the chosen one filled with the accent.
struct FieldChoice<Value: Hashable>: View {
    @Environment(\.fieldTheme) private var theme
    let options: [(label: String, value: Value)]
    @Binding var selection: Value
    var hint: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.value) { option in
                let chosen = option.value == selection
                Button { selection = option.value } label: {
                    Text(option.label).font(.title3.bold())
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .foregroundStyle(chosen ? theme.onAccentColor : theme.text(.primary))
                        .background(chosen ? theme.accentColor : theme.backgroundColor, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(theme.lineColor, lineWidth: chosen ? 0 : 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.label)
                .accessibilityHint(hint ?? "")
                .accessibilityAddTraits(chosen ? .isSelected : [])
            }
        }
    }
}

extension View {
    /// The screen's title and a back button in theme colours (the system ones stay white).
    func fieldNavigation(_ title: String) -> some View { modifier(FieldNavigation(title: title)) }
}

private struct FieldNavigation: ViewModifier {
    @Environment(\.fieldTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let title: String

    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(true)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Label("Back", systemImage: "chevron.left").labelStyle(.iconOnly)
                            .foregroundStyle(theme.text(.primary))
                    }
                    .tint(theme.text(.primary))
                    .accessibilityLabel("Back")
                    .id(theme.name)            // the toolbar keeps a stale tint unless rebuilt on a theme change
                }
                ToolbarItem(placement: .principal) {
                    Text(title).font(.title3.weight(.semibold)).foregroundStyle(theme.text(.primary))
                        .accessibilityAddTraits(.isHeader)
                }
            }
    }
}
