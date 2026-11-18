import Foundation
import Observation
import PLSCore

/// The searcher's screen choice (Auto, Day, Night), kept on this phone only. Auto follows
/// civil dusk at the team's place: the last GPS fix, else the pack's area.
@MainActor
@Observable
final class ThemeStore {
    static let key = "pls.fieldThemeMode"
    private let defaults: UserDefaults

    var mode: ThemeMode {
        didSet { defaults.set(mode.rawValue, forKey: Self.key) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        mode = defaults.string(forKey: Self.key).flatMap(ThemeMode.init(rawValue:)) ?? .auto
    }

    func tokens(at date: Date, place: Coordinate?) -> ThemeTokens {
        FieldTheme.resolve(mode: mode, date: date, at: place)
    }

    static func place(lastFix: Position?, grid: [GridSegment]) -> Coordinate? {
        if let lastFix { return Coordinate(lon: lastFix.lon, lat: lastFix.lat) }
        return grid.first?.centroid
    }
}
