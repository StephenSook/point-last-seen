import Foundation

public enum ReportKind: String, Codable, Sendable, CaseIterable {
    case cleared, sighting, clue, found, unclear
}

public enum Feature: String, Codable, Sendable, CaseIterable {
    case creekOrDrainage = "creek_or_drainage"
    case water, road, trail, structure, brush, woods, field, other, none
}

public enum Direction: String, Codable, Sendable, CaseIterable {
    case n, ne, e, se, s, sw, w, nw, upstream, downstream, unknown

    /// Compass bearing for the eight compass points; nil for stream and unknown directions.
    public var bearingDeg: Double? {
        switch self {
        case .n: return 0
        case .ne: return 45
        case .e: return 90
        case .se: return 135
        case .s: return 180
        case .sw: return 225
        case .w: return 270
        case .nw: return 315
        case .upstream, .downstream, .unknown: return nil
        }
    }
}

/// Clothing colors: a closed list that includes "unknown" (spec section 8).
public enum ClothingColor: String, Codable, Sendable, CaseIterable {
    case black, white, gray, brown, tan, red, orange, yellow, green, blue, purple, pink, unknown
}

public enum ProfileMatch: String, Codable, Sendable, CaseIterable {
    case consistent, inconsistent, unknown

    /// Authenticity comes from code, never from the model (spec section 8).
    public var authenticity: Authenticity {
        switch self {
        case .consistent: return .high
        case .unknown: return .medium
        case .inconsistent: return .low
        }
    }
}

/// What a model, the deterministic parser or the pick-list read from one report (spec section 8).
/// `coverage` holds the number as stated; code normalizes it before validation.
public struct ReportReading: Codable, Sendable, Equatable {
    public var kind: ReportKind
    public var segmentIds: [String]
    public var method: SearchMethod
    public var coverage: Double?
    public var minutes: Double?
    public var searchers: Double?
    public var searchType: SearchType
    public var detectionRangeM: Double?
    public var item: String
    public var feature: Feature
    public var direction: Direction
    public var topColor: ClothingColor
    public var bottomColor: ClothingColor
    public var footwear: String
    public var carried: String
    public var matchesProfile: ProfileMatch
    public var evidenceQuote: String

    public init(kind: ReportKind, segmentIds: [String], method: SearchMethod, coverage: Double?, minutes: Double?,
                searchers: Double?, searchType: SearchType, detectionRangeM: Double?, item: String, feature: Feature,
                direction: Direction, topColor: ClothingColor, bottomColor: ClothingColor, footwear: String,
                carried: String, matchesProfile: ProfileMatch, evidenceQuote: String) {
        self.kind = kind
        self.segmentIds = segmentIds
        self.method = method
        self.coverage = coverage
        self.minutes = minutes
        self.searchers = searchers
        self.searchType = searchType
        self.detectionRangeM = detectionRangeM
        self.item = item
        self.feature = feature
        self.direction = direction
        self.topColor = topColor
        self.bottomColor = bottomColor
        self.footwear = footwear
        self.carried = carried
        self.matchesProfile = matchesProfile
        self.evidenceQuote = evidenceQuote
    }

    /// An empty "unclear" reading, the start point for the parser and the pick-list.
    public static func unclear(quote: String = "") -> ReportReading {
        ReportReading(kind: .unclear, segmentIds: [], method: .unknown, coverage: nil, minutes: nil, searchers: nil,
                      searchType: .unknown, detectionRangeM: nil, item: "", feature: .none, direction: .unknown,
                      topColor: .unknown, bottomColor: .unknown, footwear: "", carried: "", matchesProfile: .unknown,
                      evidenceQuote: quote)
    }

    enum CodingKeys: String, CodingKey {
        case kind, segmentIds, method, coverage, minutes, searchers, searchType, detectionRangeM, item, feature,
             direction, topColor, bottomColor, footwear, carried, matchesProfile, evidenceQuote
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(segmentIds, forKey: .segmentIds)
        try c.encode(method, forKey: .method)
        try c.encode(coverage, forKey: .coverage)
        try c.encode(minutes, forKey: .minutes)
        try c.encode(searchers, forKey: .searchers)
        try c.encode(searchType, forKey: .searchType)
        try c.encode(detectionRangeM, forKey: .detectionRangeM)
        try c.encode(item, forKey: .item)
        try c.encode(feature, forKey: .feature)
        try c.encode(direction, forKey: .direction)
        try c.encode(topColor, forKey: .topColor)
        try c.encode(bottomColor, forKey: .bottomColor)
        try c.encode(footwear, forKey: .footwear)
        try c.encode(carried, forKey: .carried)
        try c.encode(matchesProfile, forKey: .matchesProfile)
        try c.encode(evidenceQuote, forKey: .evidenceQuote)
    }
}
