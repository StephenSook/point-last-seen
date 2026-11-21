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
        route.reason == .notEnglish ? "This note doesn't look like English, so it isn't sent to the cloud to be read. Pick instead of typing." : nil
    }

    /// Under a report read from a photo: it was read on the phone and the photo was not kept, and when code found it
    /// like the family's description, that too. Nil for any other report.
    public static func photoLine(inputMethod: InputMethod, reading: JSONValue?) -> String? {
        guard inputMethod == .photo else { return nil }
        let kept = "Read from a photo on this phone. The photo was not kept."
        return reading?["matchesProfile"] == .string(ProfileMatch.consistent.rawValue) ? kept + " Like the family's description." : kept
    }

    /// Why the router chose a route, in plain words for the route check screen.
    public static func reasonWords(_ reason: RouteReason) -> String {
        switch reason {
        case .onDeviceDefault: "Apple's model reads first"
        case .noNetwork: "no signal"
        case .onDeviceUnavailable: "Apple's model is not available"
        case .localeUnsupported: "Apple's model does not support this phone's language"
        case .overTokenBudget: "the report is too long for Apple's model"
        case .possibleEvidence: "possible evidence, so no model reads it"
        case .notDrillMode: "not a drill, so no model reads it"
        case .notEnglish: "the note does not look English"
        case .unknown: "a reason this version does not know"
        }
    }

    /// A read's time in seconds with one decimal.
    public static func seconds(_ ms: Double) -> String { String(format: "%.1f s", ms / 1000) }

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
