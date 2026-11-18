import Foundation

public struct Coordinate: Codable, Sendable, Equatable {
    public var lon: Double
    public var lat: Double

    public init(lon: Double, lat: Double) {
        self.lon = lon
        self.lat = lat
    }
}

/// A GPS fix as stored on an event.
public struct Position: Codable, Sendable, Equatable {
    public var lat: Double
    public var lon: Double
    public var accuracyM: Double

    public init(lat: Double, lon: Double, accuracyM: Double) {
        self.lat = lat
        self.lon = lon
        self.accuracyM = accuracyM
    }
}

/// A segment's shape: one or more polygons, each an outer ring followed by holes.
public struct SegmentGeometry: Sendable, Equatable {
    public var polygons: [[[Coordinate]]]

    public init(polygons: [[[Coordinate]]]) {
        self.polygons = polygons
    }

    public enum GeoJSONError: Error { case unsupported(String), malformed }

    /// Reads a GeoJSON Polygon or MultiPolygon (the grid's `geometryJson` string).
    public init(geoJSON: String) throws {
        let value = try JSONDecoder().decode(JSONValue.self, from: Data(geoJSON.utf8))
        guard case let .string(type)? = value["type"], let coords = value["coordinates"] else { throw GeoJSONError.malformed }
        func ring(_ v: JSONValue) throws -> [Coordinate] {
            guard case let .array(points) = v else { throw GeoJSONError.malformed }
            return try points.map { p in
                guard case let .array(xy) = p, xy.count >= 2, case let .number(x) = xy[0], case let .number(y) = xy[1] else { throw GeoJSONError.malformed }
                return Coordinate(lon: x, lat: y)
            }
        }
        func polygon(_ v: JSONValue) throws -> [[Coordinate]] {
            guard case let .array(rings) = v else { throw GeoJSONError.malformed }
            return try rings.map(ring)
        }
        switch type {
        case "Polygon":
            polygons = [try polygon(coords)]
        case "MultiPolygon":
            guard case let .array(polys) = coords else { throw GeoJSONError.malformed }
            polygons = try polys.map(polygon)
        default:
            throw GeoJSONError.unsupported(type)
        }
    }

    func contains(_ p: Coordinate) -> Bool {
        polygons.contains { rings in
            guard let outer = rings.first, Geo.ringContains(outer, p) else { return false }
            return !rings.dropFirst().contains { Geo.ringContains($0, p) && !Geo.onBoundary($0, p) }
        }
    }
}

/// One cell of the drill site grid (from the pack's `pack-segments` query).
public struct GridSegment: Sendable, Equatable {
    public var segmentId: String
    public var areaM2: Double
    public var centroid: Coordinate
    public var geometry: SegmentGeometry
    public var neighbors: [String]
    public var upstream: [String]
    public var downstream: [String]

    public init(segmentId: String, areaM2: Double, centroid: Coordinate, geometry: SegmentGeometry,
                neighbors: [String], upstream: [String], downstream: [String]) {
        self.segmentId = segmentId
        self.areaM2 = areaM2
        self.centroid = centroid
        self.geometry = geometry
        self.neighbors = neighbors
        self.upstream = upstream
        self.downstream = downstream
    }
}

public enum Geo {
    /// The segment that contains the point. A point on a shared edge goes to the lowest id,
    /// so every device picks the same cell.
    public static func segment(containing position: Position, in segments: [GridSegment]) -> String? {
        let p = Coordinate(lon: position.lon, lat: position.lat)
        return segments.filter { $0.geometry.contains(p) }.map(\.segmentId).min()
    }

    /// Compass bearing in degrees (0 north, 90 east) on a local flat approximation, which is
    /// accurate enough between neighbouring 125 m cells.
    public static func bearingDeg(from a: Coordinate, to b: Coordinate) -> Double {
        let dx = (b.lon - a.lon) * cos(a.lat * .pi / 180)
        let dy = b.lat - a.lat
        let deg = atan2(dx, dy) * 180 / .pi
        return deg < 0 ? deg + 360 : deg
    }

    /// Ray casting, counting points on the ring's edge as inside.
    static func ringContains(_ ring: [Coordinate], _ p: Coordinate) -> Bool {
        if onBoundary(ring, p) { return true }
        var inside = false
        var j = ring.count - 1
        for i in 0..<ring.count {
            let a = ring[i], b = ring[j]
            if (a.lat > p.lat) != (b.lat > p.lat) {
                let x = (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon
                if p.lon < x { inside.toggle() }
            }
            j = i
        }
        return inside
    }

    static func onBoundary(_ ring: [Coordinate], _ p: Coordinate) -> Bool {
        guard ring.count >= 2 else { return false }
        for i in 0..<(ring.count - 1) {
            let a = ring[i], b = ring[i + 1]
            let cross = (b.lon - a.lon) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lon - a.lon)
            let scale = max(abs(b.lon - a.lon), abs(b.lat - a.lat), 1e-12)
            if abs(cross) > 1e-12 * scale { continue }
            if p.lon >= min(a.lon, b.lon) - 1e-15, p.lon <= max(a.lon, b.lon) + 1e-15,
               p.lat >= min(a.lat, b.lat) - 1e-15, p.lat <= max(a.lat, b.lat) + 1e-15 { return true }
        }
        return false
    }
}
