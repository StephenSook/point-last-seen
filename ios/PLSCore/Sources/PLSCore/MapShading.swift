import Foundation

/// The search map's ink, the same as the web's (web/src/map/poaStyle.ts, theme/tokens.ts and
/// map/credit.ts): probability by the lightness of one warm hue in eight steps, the number printed
/// beside it, never by red and never by hue.
public enum MapShading {
    /// The eight steps, darkest (least likely) first: the web's POA_RAMP.
    public static let poaRamp = ["#342D23", "#534229", "#765729", "#9A6E2A", "#BD8630", "#DEA143", "#FCC270", "#FFEAC2"]

    /// A segment's step: its share of the largest probability in the grid, in eight steps (0 to 7).
    public static func poaClass8(_ poa: Double, maxPoa: Double) -> Int {
        guard maxPoa > 0, poa > 0 else { return 0 }
        return min(7, Int((poa / maxPoa * 8).rounded(.down)))
    }

    /// The printed number: one decimal, "<0.1%" below a thousandth, "0%" for none.
    public static func formatPct(_ poa: Double) -> String {
        guard poa > 0 else { return "0%" }
        if poa < 0.0005 { return "<0.1%" }
        return String(format: "%.1f%%", poa * 100)
    }

    /// The OpenStreetMap license line (ODbL): shown exactly when something drawn from OpenStreetMap
    /// is on screen. The grid's own line when segments are drawn, else the plain one.
    public static let osmCredit = "Map data from OpenStreetMap"

    public static func credit(segments: Int, basemap: Bool, gridAttribution: String?) -> String? {
        if segments > 0, let gridAttribution, !gridAttribution.isEmpty { return gridAttribution }
        return segments > 0 || basemap ? osmCredit : nil
    }

    /// One segment as the map draws it.
    public struct Segment: Sendable, Equatable {
        public var segmentId: String
        public var polygons: [[[Coordinate]]]
        public var cls: Int
        /// The printed number; empty when the segment has no value.
        public var label: String
        /// True for the team's own segments, which the map outlines.
        public var assigned: Bool
    }

    /// The grid's segments with their step (relative to the largest in the grid), printed number and
    /// whether they are the team's. ROW is not a grid segment, so it is never drawn.
    public static func segments(_ grid: [GridSegment], poa: [String: Double], assigned: Set<String>) -> [Segment] {
        let maxPoa = grid.map { poa[$0.segmentId] ?? 0 }.max() ?? 0
        return grid.map { s in
            let p = poa[s.segmentId]
            return Segment(segmentId: s.segmentId, polygons: s.geometry.polygons, cls: poaClass8(p ?? 0, maxPoa: max(0, maxPoa)),
                           label: p.map(formatPct) ?? "", assigned: assigned.contains(s.segmentId))
        }
    }
}
