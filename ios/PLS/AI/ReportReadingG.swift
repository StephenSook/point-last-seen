import FoundationModels
import PLSCore

// The @Generable twin of PLSCore.ReportReading, used on both routes (Apple's on-device model
// and Gemini through Firebase AI Logic). No pattern guides: Gemini rejects them.

@Generable enum KindG: CaseIterable { case cleared, sighting, clue, found, unclear }
@Generable enum MethodG: CaseIterable { case visual, sound, both, unknown }
@Generable enum SearchTypeG: CaseIterable { case sweep, hasty, unknown }
@Generable enum FeatureG: CaseIterable { case creekOrDrainage, water, road, trail, structure, brush, woods, field, other, none }
@Generable enum DirectionG: CaseIterable { case n, ne, e, se, s, sw, w, nw, upstream, downstream, unknown }
@Generable enum ColorG: CaseIterable { case black, white, gray, brown, tan, red, orange, yellow, green, blue, purple, pink, unknown }
@Generable enum MatchG: CaseIterable { case consistent, inconsistent, unknown }

@Generable
struct ReportReadingG {
    @Guide(description: "cleared: the team searched an area. clue: an item, track or sign. sighting: someone saw a person. found: the subject was located. unclear: none of these.")
    var kind: KindG
    @Guide(description: "Segment ids the report itself names, two capital letters each. Empty when the report names none.", .maximumCount(3))
    var segmentIds: [String]
    @Guide(description: "How the team searched: by looking, by calling out, or both.")
    var method: MethodG
    @Guide(description: "The coverage number exactly as the report states it. Empty when not stated.")
    var coverage: Double?
    @Guide(description: "Minutes spent searching, if stated.")
    var minutes: Double?
    @Guide(description: "Number of searchers, if stated.")
    var searchers: Int?
    var searchType: SearchTypeG
    @Guide(description: "Visual detection range in metres, if stated.")
    var detectionRangeM: Double?
    @Guide(description: "The item found, a few words, or empty.")
    var item: String
    var feature: FeatureG
    @Guide(description: "Which way the person or tracks were heading, if stated.")
    var direction: DirectionG
    var topColor: ColorG
    var bottomColor: ColorG
    var footwear: String
    var carried: String
    @Guide(description: "Does the clothing or appearance in the report match the subject description tool? unknown when you cannot tell.")
    var matchesProfile: MatchG
    @Guide(description: "Words copied exactly from the report that support this reading.")
    var evidenceQuote: String

    var reading: ReportReading {
        ReportReading(kind: kind.core, segmentIds: segmentIds, method: method.core, coverage: coverage, minutes: minutes,
                      searchers: searchers.map(Double.init), searchType: searchType.core, detectionRangeM: detectionRangeM,
                      item: item, feature: feature.core, direction: direction.core, topColor: topColor.core,
                      bottomColor: bottomColor.core, footwear: footwear, carried: carried,
                      matchesProfile: matchesProfile.core, evidenceQuote: evidenceQuote)
    }
}

extension KindG { var core: ReportKind { switch self { case .cleared: .cleared; case .sighting: .sighting; case .clue: .clue; case .found: .found; case .unclear: .unclear } } }
extension MethodG { var core: SearchMethod { switch self { case .visual: .visual; case .sound: .sound; case .both: .both; case .unknown: .unknown } } }
extension SearchTypeG { var core: SearchType { switch self { case .sweep: .sweep; case .hasty: .hasty; case .unknown: .unknown } } }
extension FeatureG {
    var core: Feature {
        switch self {
        case .creekOrDrainage: .creekOrDrainage; case .water: .water; case .road: .road; case .trail: .trail
        case .structure: .structure; case .brush: .brush; case .woods: .woods; case .field: .field; case .other: .other; case .none: .none
        }
    }
}
extension DirectionG {
    var core: Direction {
        switch self {
        case .n: .n; case .ne: .ne; case .e: .e; case .se: .se; case .s: .s; case .sw: .sw; case .w: .w; case .nw: .nw
        case .upstream: .upstream; case .downstream: .downstream; case .unknown: .unknown
        }
    }
}
extension ColorG {
    var core: ClothingColor {
        switch self {
        case .black: .black; case .white: .white; case .gray: .gray; case .brown: .brown; case .tan: .tan; case .red: .red
        case .orange: .orange; case .yellow: .yellow; case .green: .green; case .blue: .blue; case .purple: .purple
        case .pink: .pink; case .unknown: .unknown
        }
    }
}
extension MatchG { var core: ProfileMatch { switch self { case .consistent: .consistent; case .inconsistent: .inconsistent; case .unknown: .unknown } } }
