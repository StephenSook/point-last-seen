import AppIntents
import SwiftUI
import WidgetKit

/// The "Log report" control for the Action button and Control Center.
struct LogReportControl: ControlWidget {
    static let kind = "app.pointlastseen.field.log-report"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: LogReportIntent()) {
                Label("Log report", systemImage: "square.and.pencil")
            }
        }
        .displayName("Log report")
        .description("Opens Point Last Seen on the Report field.")
    }
}
