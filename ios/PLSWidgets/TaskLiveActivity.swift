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
                Text("Training drill. Nobody is missing.").font(.title3.weight(.semibold))
                Text("Your segments: \(context.state.status.segments)").font(.title2.bold())
                Text(context.state.status.line).font(.title3.weight(.semibold)).foregroundStyle(theme.text(.secondary))
                // The app can change this card only while it is open, so the card says when it was set. One
                // line: the lock screen gives a card no room for a fifth.
                if let setAt = context.state.setAt {
                    Text("Set by the app at \(setAt, style: .time).")
                        .font(.title3.weight(.semibold)).foregroundStyle(theme.text(.secondary))
                }
            }
            .foregroundStyle(theme.text(.primary))
            .font(.title3.weight(.semibold))
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .activityBackgroundTint(theme.backgroundColor)
            .activitySystemActionForegroundColor(theme.text(.primary))
        } dynamicIsland: { context in
            let theme = context.state.night ? FieldTheme.night : FieldTheme.day
            let status = context.state.status
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Drill").font(.title3.weight(.semibold)).foregroundStyle(theme.accentColor)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(status.segments).font(.title3.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(status.line).font(.title3.weight(.semibold))
                }
            } compactLeading: {
                Text(status.segments).font(.title3.bold())
            } compactTrailing: {
                Text("\(status.waiting)").font(.title3.weight(.semibold)).accessibilityLabel("\(status.waiting) waiting")
            } minimal: {
                Text("\(status.waiting)").font(.title3.weight(.semibold))
            }
            .keylineTint(theme.accentColor)
        }
    }
}
