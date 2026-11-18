import AppIntents
import Testing
@testable import PLS

/// The "Log report" Control (Action button or Control Center) opens the app on the Report
/// field, so a searcher can report with one press and the system keyboard's microphone key.
@MainActor
@Suite struct LogReportIntentTests {
    @Test func theIntentOpensTheAppInTheForeground() {
        #expect(LogReportIntent.supportedModes == .foreground(.immediate))
    }

    @Test func runningItAsksForTheReportFieldOnce() async throws {
        ReportFocus.shared.clear()
        _ = try await LogReportIntent().perform()
        #expect(ReportFocus.shared.pending)
        #expect(ReportFocus.shared.take())
        #expect(!ReportFocus.shared.take())                          // asked once, focused once
    }
}
