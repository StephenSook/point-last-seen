import Foundation

/// Reserved segment id for prior mass outside the mapped grid ("outside the mapped area").
public enum SegmentIDs {
    public static let row = "ROW"
}

public enum Influence: String, Codable, Sendable, CaseIterable, Hashable {
    case strongFor = "strong_for"
    case `for` = "for"
    case neutral
    case against
    case strongAgainst = "strong_against"
}

public enum Authenticity: String, Codable, Sendable, CaseIterable, Hashable {
    case high, medium, low
}

public enum SearchType: String, Codable, Sendable, CaseIterable {
    case sweep, hasty, unknown
}

public enum SearchMethod: String, Codable, Sendable, CaseIterable {
    case visual, sound, both, unknown
}

/// Where the visual detection range came from (spec section 10.4).
public enum RdBasis: String, Codable, Sendable, CaseIterable {
    case hiddenTarget = "hidden_target"
    case openTarget = "open_target"
    case `default` = "default"
    /// The report itself stated the range.
    case stated
}

public struct IocBase: Codable, Sendable, Equatable {
    public var strongFor: Double
    public var `for`: Double
    public var neutral: Double
    public var against: Double
    public var strongAgainst: Double

    public init(strongFor: Double, for f: Double, neutral: Double, against: Double, strongAgainst: Double) {
        self.strongFor = strongFor
        self.for = f
        self.neutral = neutral
        self.against = against
        self.strongAgainst = strongAgainst
    }

    enum CodingKeys: String, CodingKey {
        case strongFor = "strong_for"
        case `for` = "for"
        case neutral
        case against
        case strongAgainst = "strong_against"
    }

    public func value(_ influence: Influence) -> Double {
        switch influence {
        case .strongFor: return strongFor
        case .for: return self.for
        case .neutral: return neutral
        case .against: return against
        case .strongAgainst: return strongAgainst
        }
    }
}

public struct AuthenticityWeight: Codable, Sendable, Equatable {
    public var high: Double
    public var medium: Double
    public var low: Double

    public init(high: Double, medium: Double, low: Double) {
        self.high = high
        self.medium = medium
        self.low = low
    }

    public func value(_ authenticity: Authenticity) -> Double {
        switch authenticity {
        case .high: return high
        case .medium: return medium
        case .low: return low
        }
    }
}

public struct DetectionProfile: Codable, Sendable, Equatable {
    public var soundCounts: Bool

    public init(soundCounts: Bool) {
        self.soundCounts = soundCounts
    }
}

/// Engine numbers. They travel in the incident doc and the pack, never in Remote Config.
public struct EngineParams: Codable, Sendable, Equatable {
    public var sweepWidthFactor: Double
    public var sweepSpeedMps: Double
    public var hastySpeedMps: Double
    public var secondsPerMinute: Double
    public var iocBase: IocBase
    public var authenticityWeight: AuthenticityWeight
    public var detectionProfile: DetectionProfile

    public init(
        sweepWidthFactor: Double,
        sweepSpeedMps: Double,
        hastySpeedMps: Double,
        secondsPerMinute: Double = 60,
        iocBase: IocBase,
        authenticityWeight: AuthenticityWeight,
        detectionProfile: DetectionProfile
    ) {
        self.sweepWidthFactor = sweepWidthFactor
        self.sweepSpeedMps = sweepSpeedMps
        self.hastySpeedMps = hastySpeedMps
        self.secondsPerMinute = secondsPerMinute
        self.iocBase = iocBase
        self.authenticityWeight = authenticityWeight
        self.detectionProfile = detectionProfile
    }
}
