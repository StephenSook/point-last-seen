import PLSCore
import SwiftUI

/// Report by picking, not typing: what happened, where, and for a clear how long and how many.
/// Large buttons for gloves; no model reads anything here.
struct PickListView: View {
    let segments: [String]
    let send: (PickListChoice) -> Void
    @Environment(\.fieldTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var kind: ReportKind = .cleared
    @State private var segment: String? = nil
    @State private var minutes: Double = 30
    @State private var searchers: Double = 2

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("What happened").font(.title3.bold())
                FieldChoice(options: [("Cleared", ReportKind.cleared), ("Clue", .clue), ("Saw them", .sighting), ("Found", .found)],
                            selection: $kind)
                Text("Where").font(.title3.bold())
                FieldChoice(options: segments.map { ($0, Optional($0)) } + [("Here (GPS)", nil)], selection: $segment)
                if kind == .cleared {
                    Text("How long, in minutes").font(.title3.bold())
                    FieldChoice(options: [15, 30, 60, 90].map { ("\(Int($0))", $0) }, selection: $minutes)
                    Text("How many searched").font(.title3.bold())
                    FieldChoice(options: [1, 2, 3, 4, 6].map { ("\(Int($0))", $0) }, selection: $searchers)
                }
                Button {
                    send(PickListChoice(kind: kind, segmentId: segment, minutes: kind == .cleared ? minutes : nil,
                                        searchers: kind == .cleared ? searchers : nil))
                    dismiss()
                } label: {
                    Text("Send").font(.largeTitle.bold()).frame(maxWidth: .infinity, minHeight: 80)
                        .foregroundStyle(theme.onAccentColor)
                        .background(theme.accentColor, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
            .padding()
        }
        .background(theme.backgroundColor)
    }
}
