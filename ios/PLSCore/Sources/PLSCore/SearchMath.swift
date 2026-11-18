import Foundation

/// Result of reading a stated coverage number (spec section 10.3).
public enum CoverageValue: Equatable, Sendable {
    case ratio(Double)
    case none
    case invalid
}

/// Search-theory formulas (spec section 10.1). Plain arithmetic, no state.
public enum SearchMath {
    /// Sweep width W = factor x Rd, with Rd the visual detection range in metres.
    public static func sweepWidth(detectionRangeM: Double, params: EngineParams) -> Double {
        params.sweepWidthFactor * detectionRangeM
    }

    /// Track length L = V x T x searchers, with T in seconds (reports give minutes).
    /// An unknown search type uses the slower sweep speed, which gives the lower POD.
    public static func trackLength(minutes: Double, searchers: Double, searchType: SearchType, params: EngineParams) -> Double {
        let speed = searchType == .hasty ? params.hastySpeedMps : params.sweepSpeedMps
        return speed * (minutes * params.secondsPerMinute) * searchers
    }

    /// Coverage C = W x L / A.
    public static func coverage(sweepWidthM: Double, trackLengthM: Double, areaM2: Double) -> Double {
        sweepWidthM * trackLengthM / areaM2
    }

    /// POD = 1 - e^(-C) (Frost 1996).
    public static func pod(coverage: Double) -> Double {
        1 - exp(-coverage)
    }

    /// IOC = 1 - weight x (1 - base), our likelihood table (spec section 10.2).
    public static func ioc(_ influence: Influence, authenticity: Authenticity, params: EngineParams) -> Double {
        let base = params.iocBase.value(influence)
        let weight = params.authenticityWeight.value(authenticity)
        return 1 - weight * (1 - base)
    }

    /// 0 to 3 is kept as a ratio; above 3 and up to 300 is a percentage and is divided by 100;
    /// anything else is invalid; nil means no stated coverage.
    public static func normalizeCoverage(_ value: Double?) -> CoverageValue {
        guard let value else { return .none }
        guard value.isFinite else { return .invalid }
        if value >= 0 && value <= 3 { return .ratio(value) }
        if value > 3 && value <= 300 { return .ratio(value / 100) }
        return .invalid
    }
}
