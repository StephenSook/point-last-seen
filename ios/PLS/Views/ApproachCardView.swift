import PLSCore
import SwiftUI

/// Who the person is and how to approach them, from the pack. Code and fixed copy, no model.
struct ApproachCardView: View {
    let card: ApproachCard
    @State private var showMore = false
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let names = card.names {
                Text(names).accessibilityIdentifier("approach-names")
            }
            ForEach(card.first, id: \.id) { line in
                Text(line.text)
            }
            if !card.more.isEmpty {
                DisclosureGroup("More", isExpanded: $showMore) {
                    ForEach(card.more, id: \.id) { line in
                        Text(line.text).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            Text(card.footer).font(.title3.weight(.semibold)).foregroundStyle(theme.text(.secondary))
        }
    }
}
