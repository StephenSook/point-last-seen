import PLSCore
import SwiftUI

/// Turns the theme's `#RRGGBB` strings into SwiftUI colours.
enum FieldColor {
    struct RGB: Equatable { var red: Double; var green: Double; var blue: Double }

    static func rgb(_ hex: String) -> RGB {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let v = UInt32(digits, radix: 16) else { return RGB(red: 0, green: 0, blue: 0) }
        return RGB(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }

    static func color(_ hex: String) -> Color {
        let c = rgb(hex)
        return Color(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: 1)
    }
}

extension ThemeTokens {
    var backgroundColor: Color { FieldColor.color(background) }
    var accentColor: Color { FieldColor.color(accent) }
    var onAccentColor: Color { FieldColor.color(onAccent) }
    var lineColor: Color { FieldColor.color(line) }
    func text(_ role: TextRole, sizePt: Double = 20) -> Color { FieldColor.color(textColor(sizePt: sizePt, role: role)) }
}

private struct FieldThemeKey: EnvironmentKey {
    static let defaultValue = FieldTheme.day
}

extension EnvironmentValues {
    /// The field theme in force: day or night colours.
    var fieldTheme: ThemeTokens {
        get { self[FieldThemeKey.self] }
        set { self[FieldThemeKey.self] = newValue }
    }
}
