import Foundation

public enum ValidationResult: Equatable, Sendable {
    case ok
    case invalid(reasons: [String])

    public var isOK: Bool { self == .ok }
}

/// Code validates every reading before it becomes an effect (rule R3). Coverage is checked
/// after normalization, so a stated percentage is already a ratio here.
public enum ReadingValidator {
    public static let maxSegments = 3
    public static let maxItemLength = 40

    public static func validate(_ reading: ReportReading, knownSegmentIds: [String], rawText: String) -> ValidationResult {
        var reasons: [String] = []
        let known = Set(knownSegmentIds)
        if reading.segmentIds.count > maxSegments { reasons.append("too_many_segments") }
        for id in reading.segmentIds where !known.contains(id) { reasons.append("unknown_segment:\(id)") }
        if let c = reading.coverage, !(c.isFinite && c >= 0 && c <= 3) { reasons.append("coverage_out_of_range") }
        if let m = reading.minutes, !(m.isFinite && m > 0 && m <= 1440) { reasons.append("minutes_out_of_range") }
        if let s = reading.searchers, !(s.isFinite && s >= 1 && s <= 100 && s.rounded() == s) { reasons.append("searchers_out_of_range") }
        if let r = reading.detectionRangeM, !(r.isFinite && r >= 1 && r <= 100) { reasons.append("detection_range_out_of_range") }
        if reading.item.count > maxItemLength { reasons.append("item_too_long") }
        if !quoteIsFromText(reading.evidenceQuote, rawText) { reasons.append("quote_not_in_text") }
        return reasons.isEmpty ? .ok : .invalid(reasons: reasons)
    }

    /// The quote must be a substring of the report (case and spacing may differ). An empty
    /// quote is accepted only when there is no text, as for a pick-list entry.
    static func quoteIsFromText(_ quote: String, _ raw: String) -> Bool {
        let q = squash(quote), r = squash(raw)
        if q.isEmpty { return r.isEmpty }
        return r.contains(q)
    }

    static func squash(_ s: String) -> String {
        s.lowercased().split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }
}
