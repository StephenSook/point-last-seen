import Foundation

/// Turns the pack's `pack-segments` documents into the grid and the prior (a pack design
/// decision): grid segments in segmentId code-point order, then ROW last, read from its own
/// document (never computed as one minus the rest, which would drift between devices).
public enum PackSegments {
    public enum PackError: Error, Equatable {
        case missingRow
        case badSegment(String)
        case mixedPriorVersions
    }

    public struct Parsed: Sendable, Equatable {
        public var grid: [GridSegment]
        public var prior: [SegmentPrior]
        public var priorVersion: Int
    }

    public static func parse(_ docs: [JSONValue]) throws -> Parsed {
        var cells: [(GridSegment, Double)] = []
        var rowPoa: Double?
        var versions = Set<Int>()
        for doc in docs {
            guard case let .string(id)? = doc["segmentId"], case let .number(poa)? = doc["priorPoa"], poa.isFinite, poa >= 0,
                  case let .number(versionValue)? = doc["priorVersion"], let version = Int(exactly: versionValue) else {
                throw PackError.badSegment(stringValue(doc["segmentId"]) ?? "(no id)")
            }
            versions.insert(version)
            if id == SegmentIDs.row { rowPoa = poa; continue }
            guard case let .number(area)? = doc["areaM2"], area > 0,
                  case let .number(lat)? = doc["centroid"]?["lat"], case let .number(lon)? = doc["centroid"]?["lon"],
                  case let .string(geoJSON)? = doc["geometryJson"], let geometry = try? SegmentGeometry(geoJSON: geoJSON) else {
                throw PackError.badSegment(id)
            }
            let segment = GridSegment(segmentId: id, areaM2: area, centroid: Coordinate(lon: lon, lat: lat), geometry: geometry,
                                      neighbors: strings(doc["neighbors"]), upstream: strings(doc["upstream"]),
                                      downstream: strings(doc["downstream"]))
            cells.append((segment, poa))
        }
        guard let rowPoa else { throw PackError.missingRow }
        guard versions.count == 1, let version = versions.first else { throw PackError.mixedPriorVersions }
        cells.sort { $0.0.segmentId.unicodeScalars.lexicographicallyPrecedes($1.0.segmentId.unicodeScalars) }
        return Parsed(grid: cells.map(\.0),
                      prior: cells.map { SegmentPrior(segmentId: $0.0.segmentId, priorPoa: $0.1) } + [SegmentPrior(segmentId: SegmentIDs.row, priorPoa: rowPoa)],
                      priorVersion: version)
    }

    static func strings(_ v: JSONValue?) -> [String] {
        guard case let .array(a)? = v else { return [] }
        return a.compactMap { if case let .string(s) = $0 { s } else { nil } }
    }

    static func stringValue(_ v: JSONValue?) -> String? {
        if case let .string(s)? = v { return s }
        return nil
    }
}
