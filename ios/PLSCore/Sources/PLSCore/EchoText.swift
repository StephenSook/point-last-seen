import Foundation

/// The words on the report echo card. Few words, plain, and honest about who read the report:
/// the iOS route is our own record, so it is never described as reported by the SDK.
public enum EchoText {
    /// The effect line for an event of this type: a sighting is named as one, and it changes
    /// the map only once command confirms it.
    /// In the practice drill (`practice`) there is no command to ask, so "Ask command." becomes what
    /// to do in a real search; every other line stays the same.
    public static func effectLine(_ effect: Effect, type: EventType, practice: Bool) -> String {
        let line = effectLine(effect, type: type)
        let ask = "Ask command."
        guard practice, line.hasSuffix(ask) else { return line }
        return line.dropLast(ask.count) + "In a real search, ask command."
    }

    public static func effectLine(_ effect: Effect, type: EventType) -> String {
        if type == .sighting, case let .clue(influences, _) = effect {
            let at = influences.first { $0.value == .strongFor }?.key ?? influences.keys.sorted().first ?? "?"
            return "Sighting logged in \(at). It counts once command confirms it."
        }
        return effectLine(effect)
    }

    public static func effectLine(_ effect: Effect) -> String {
        switch effect {
        case let .cleared(segmentId, pod, inputs):
            return "Cleared \(segmentId). Coverage \(number(inputs.coverage)). POD \(Int((pod * 100).rounded()))%."
        case let .clue(influences, _):
            let at = influences.first { $0.value == .strongFor }?.key ?? influences.keys.sorted().first ?? "?"
            return "Clue logged in \(at)."
        case let .none(why):
            switch why {
            case .soundOnly: return "Calling alone is not counted for this person."
            case .needsCommand: return "Ask command."
            case .invalid: return "Could not read this report. Ask command."
            case .outsideArea: return "Outside the search area. Ask command."
            case .informational, .incorporatedInPrior: return "Logged for command."
            }
        }
    }

    /// True when the card should offer "Ask command".
    public static func asksCommand(_ effect: Effect) -> Bool {
        if case let .none(why) = effect { return why != .informational && why != .incorporatedInPrior }
        return false
    }

    /// Why a report was kept off a route, shown under it; nil when nothing was refused.
    public static func refusalLine(_ route: RouteRecord) -> String? {
        route.reason == .notEnglish ? "This note doesn't look like English, so it stays on this phone. Pick instead of typing." : nil
    }

    public static func deliveryLine(_ state: OutboxState) -> String {
        switch state {
        case .pending: return "On this phone only"
        case .checking: return "Checking delivery"
        case .acked: return "Delivered"
        case let .rejected(reason): return Outbox.isRetryable(reason: reason) ? "Not delivered. Retry" : "Not delivered. Ask command"
        }
    }

    public static func routeLine(_ route: RouteRecord) -> String {
        if route.stage == .evidenceProtocol || route.stage == .picklist { return "Not sent to any model." }
        switch route.path {
        case .onDevice: return "Suggested by Apple's on-device model on this iPhone"
        case .cloud: return "Suggested by Gemini in the cloud"
        case .rules: return route.blocked == nil ? "Read by rules, not a model" : "Read by rules, not a model (the model declined)"
        }
    }

    /// Up to two decimals, no trailing zeros: 0.8, 0.52, 1.
    static func number(_ x: Double) -> String {
        let rounded = (x * 100).rounded() / 100
        var s = String(format: "%.2f", rounded)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}
