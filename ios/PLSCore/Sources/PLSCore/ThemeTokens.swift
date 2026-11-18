import Foundation

public enum TextRole: Sendable { case primary, secondary, tertiary }

/// One field theme (spec section 22.1). Probability is shown by lightness and a printed number,
/// never by hue; at night everything is red, so the signals are lightness, hatch and the number.
public struct ThemeTokens: Sendable, Equatable {
    public let name: String
    public let background: String
    public let accent: String             // the Report bar and "your segment"
    public let onAccent: String
    public let line: String
    public let priorityRamp: [String]     // six lightness classes, darkest first
    public let hatchTopClass: Bool
    let primary: String
    let secondary: String
    let tertiarySmall: String
    let tertiaryLarge: String

    /// A colour that only reaches 4.5 to 1 at large sizes is used at 24 pt or more only.
    public func textColor(sizePt: Double, role: TextRole) -> String {
        switch role {
        case .primary: return primary
        case .secondary: return secondary
        case .tertiary: return sizePt >= 24 ? tertiaryLarge : tertiarySmall
        }
    }
}

public enum FieldTheme {
    /// Black, white and one amber.
    public static let day = ThemeTokens(
        name: "day", background: "#000000", accent: "#FFB020", onAccent: "#000000", line: "#808080",
        priorityRamp: ["#000000", "#2B2B2B", "#555555", "#808080", "#B3B3B3", "#FFFFFF"], hatchTopClass: false,
        primary: "#FFFFFF", secondary: "#C7C9CC", tertiarySmall: "#B3B3B3", tertiaryLarge: "#B3B3B3")

    /// Red on black, to keep night vision.
    public static let night = ThemeTokens(
        name: "night", background: "#000000", accent: "#ED4138", onAccent: "#000000", line: "#831B16",
        priorityRamp: ["#1F0605", "#3D0C0A", "#831B16", "#C93029", "#ED4138", "#FF5448"], hatchTopClass: true,
        primary: "#FF5448", secondary: "#ED4138", tertiarySmall: "#ED4138", tertiaryLarge: "#C93029")
}

/// What the searcher chose on the Ready check. Auto follows civil dusk at the team's place.
public enum ThemeMode: String, CaseIterable, Sendable {
    case auto, day, night
}

extension FieldTheme {
    /// Auto picks night between civil dusk and civil dawn at `place`; with no place known yet
    /// (no fix and no pack), it stays day, and the searcher can choose Night by hand.
    public static func resolve(mode: ThemeMode, date: Date, at place: Coordinate?) -> ThemeTokens {
        switch mode {
        case .day: return day
        case .night: return night
        case .auto:
            guard let place else { return day }
            return Dusk.isAfterCivilDusk(date: date, lat: place.lat, lon: place.lon) ? night : day
        }
    }
}
