import Foundation

/// The search map's number plates. A searcher needs two things from the map: where their own
/// segment is, and where the likely areas are. So the team's own segments always get a plate (with
/// the team id), any other segment gets one only at 1% or more and only when the plate fits inside
/// the segment at the current zoom, and a "<0.1%" plate is never drawn.
public enum MapPlates {
    /// The smallest probability another team's segment needs for a plate.
    public static let minimumPoa = 0.01

    public struct Plate: Sendable, Equatable {
        public var segmentId: String
        public var text: String
        /// The team's own segment: always shown, drawn in high contrast.
        public var team: Bool
    }

    /// The plates that may be drawn, in the segments' order.
    public static func plates(_ segments: [MapShading.Segment], poa: [String: Double], teamId: String) -> [Plate] {
        segments.compactMap { s in
            let number = s.label.isEmpty || s.label == "<0.1%" ? nil : s.label
            if s.assigned {
                return Plate(segmentId: s.segmentId, text: number.map { "\(teamId) \($0)" } ?? teamId, team: true)
            }
            guard let number, (poa[s.segmentId] ?? 0) >= minimumPoa else { return nil }
            return Plate(segmentId: s.segmentId, text: number, team: false)
        }
    }

    /// Whether a plate shows at the current zoom: the team's always; another only when it fits
    /// inside its segment's on-screen box, so it is hidden rather than clipped or piled on others.
    public static func shows(_ plate: Plate, plateWidth: Double, plateHeight: Double, segmentWidth: Double, segmentHeight: Double) -> Bool {
        plate.team || (plateWidth <= segmentWidth && plateHeight <= segmentHeight)
    }
}
