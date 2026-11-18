import PLSCore
import SwiftUI

/// Who the person is and how to approach them, from the pack. Code and fixed copy, no model.
struct ApproachCardView: View {
    let card: ApproachCard
    @State private var showMore = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
            Text(card.footer).font(.footnote).foregroundStyle(.secondary)
        }
    }
}
