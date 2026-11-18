import ActivityKit
import PLSCore
import SwiftUI
import WidgetKit

/// The team's task on the lock screen and in the Dynamic Island, in the field colours.
struct TaskLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TaskActivityAttributes.self) { context in
            let theme = context.state.night ? FieldTheme.night : FieldTheme.day
            VStack(alignment: .leading, spacing: 6) {
                Text("Training drill. Nobody is missing.").font(.headline)
                Text("Your segments: \(context.state.status.segments)").font(.title2.bold())
                Text(context.state.status.line).font(.headline).foregroundStyle(theme.text(.secondary))
            }
            .foregroundStyle(theme.text(.primary))
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .activityBackgroundTint(theme.backgroundColor)
            .activitySystemActionForegroundColor(theme.text(.primary))
        } dynamicIsland: { context in
            let theme = context.state.night ? FieldTheme.night : FieldTheme.day
            let status = context.state.status
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Drill").font(.headline).foregroundStyle(theme.accentColor)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(status.segments).font(.headline.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(status.line).font(.headline)
                }
            } compactLeading: {
                Text(status.segments).font(.headline.bold())
            } compactTrailing: {
                Text("\(status.waiting)").font(.headline).accessibilityLabel("\(status.waiting) waiting")
            } minimal: {
                Text("\(status.waiting)").font(.headline)
            }
            .keylineTint(theme.accentColor)
        }
    }
}
