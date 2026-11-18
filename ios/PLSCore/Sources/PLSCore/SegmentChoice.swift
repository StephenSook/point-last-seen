import Foundation

/// Which segments a report is about, decided by code and never by a model (coordinator ruling
/// 2026-11-18, from spike S1: the model copied the team's assignment instead of the segment the
/// report named). The ids the report text names, by the parser's rule (capital letters, or after
/// "segment"), unknown ones included so the validator rejects them; if it names none, the
/// segment under the searcher's GPS fix; else none, and the effect falls back to the assignment.
public enum SegmentChoice {
    public static func ids(rawText: String, known: [String], positionSegmentId: String?) -> [String] {
        let named = ReportParser.segments(Tokens(rawText), known: Set(known))
        if !named.isEmpty { return named }
        return positionSegmentId.map { [$0] } ?? []
    }
}
