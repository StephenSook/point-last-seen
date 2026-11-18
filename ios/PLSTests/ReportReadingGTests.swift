import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct ReportReadingGTests {
    @Test func everyFieldMapsToTheCoreReading() {
        let g = ReportReadingG(kind: .clue, segmentIds: ["AC"], method: .both, coverage: 80, minutes: 45, searchers: 3,
                               searchType: .hasty, detectionRangeM: 12, item: "slipper", feature: .creekOrDrainage,
                               direction: .downstream, topColor: .red, bottomColor: .blue, footwear: "slipper",
                               carried: "", matchesProfile: .consistent, evidenceQuote: "found a slipper")
        let r = g.reading
        #expect(r == ReportReading(kind: .clue, segmentIds: ["AC"], method: .both, coverage: 80, minutes: 45, searchers: 3,
                                   searchType: .hasty, detectionRangeM: 12, item: "slipper", feature: .creekOrDrainage,
                                   direction: .downstream, topColor: .red, bottomColor: .blue, footwear: "slipper",
                                   carried: "", matchesProfile: .consistent, evidenceQuote: "found a slipper"))
    }

    @Test func everyCoreEnumValueHasAGenerableValue() {
        #expect(Set(KindG.allCases.map(\.core)) == Set(ReportKind.allCases))
        #expect(Set(MethodG.allCases.map(\.core)) == Set(SearchMethod.allCases))
        #expect(Set(SearchTypeG.allCases.map(\.core)) == Set(SearchType.allCases))
        #expect(Set(FeatureG.allCases.map(\.core)) == Set(Feature.allCases))
        #expect(Set(DirectionG.allCases.map(\.core)) == Set(Direction.allCases))
        #expect(Set(ColorG.allCases.map(\.core)) == Set(ClothingColor.allCases))
        #expect(Set(MatchG.allCases.map(\.core)) == Set(ProfileMatch.allCases))
    }
}
