import AppIntents
import Observation

/// Opens the app on the Report field (P-08). Assigned to the Action button or added to Control
/// Center, it lets a searcher start a report with one press; the system keyboard's microphone key
/// is then in view. It runs in the app, in the foreground, so the field can take focus.
struct LogReportIntent: AppIntent {
    static let title: LocalizedStringResource = "Log report"
    static let description = IntentDescription("Opens Point Last Seen on the Report field.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    @MainActor
    func perform() async throws -> some IntentResult {
        ReportFocus.shared.request()
        return .result()
    }
}

/// A one-shot request for the field screen to focus the Report field.
@MainActor
@Observable
final class ReportFocus {
    static let shared = ReportFocus()
    private(set) var pending = false

    func request() { pending = true }
    func clear() { pending = false }

    /// True once per request.
    func take() -> Bool {
        defer { pending = false }
        return pending
    }
}
