import Foundation

/// The link glyph in the field header: four states that differ in shape and number, never in
/// colour alone. The words are for VoiceOver. Symbol names are SF Symbols.
public struct LinkState: Sendable, Equatable {
    public var symbol: String
    public var badge: Int?
    public var label: String

    public static func make(online: Bool, waiting: Int) -> LinkState {
        let n = max(0, waiting)
        let reports = "\(n) \(n == 1 ? "report" : "reports")"
        switch (online, n > 0) {
        case (true, false): return LinkState(symbol: "antenna.radiowaves.left.and.right", badge: nil, label: "Signal. Nothing waiting.")
        case (false, false): return LinkState(symbol: "antenna.radiowaves.left.and.right.slash", badge: nil, label: "No signal. Nothing waiting.")
        case (false, true): return LinkState(symbol: "tray.and.arrow.up", badge: n, label: "No signal. \(reports) waiting to send.")
        case (true, true): return LinkState(symbol: "arrow.triangle.2.circlepath", badge: n, label: "Sending \(reports).")
        }
    }
}

/// The source glyph on each read report: where it was read. Driven by the app's own router's
/// route record, never called SDK-reported.
public struct RouteMark: Sendable, Equatable {
    public var symbol: String
    public var label: String

    public static func make(_ route: RouteRecord) -> RouteMark {
        if route.stage == .evidenceProtocol { return RouteMark(symbol: "hand.raised", label: "Not sent to any model.") }
        if route.stage == .picklist { return RouteMark(symbol: "hand.tap", label: "Not sent to any model.") }
        switch route.path {
        case .onDevice: return RouteMark(symbol: "iphone", label: "Read on this phone.")
        case .cloud: return RouteMark(symbol: "cloud", label: "Read in the cloud.")
        case .rules: return RouteMark(symbol: "list.bullet.rectangle", label: "Read by the phone's rules. No model.")
        }
    }
}
