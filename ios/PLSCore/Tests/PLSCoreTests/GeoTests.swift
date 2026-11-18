import Testing
@testable import PLSCore

@Suite struct GeoTests {
    @Test func pointInsideACellFindsIt() {
        #expect(Geo.segment(containing: inside("AB"), in: grid) == "AB")
        #expect(Geo.segment(containing: inside("AC"), in: grid) == "AC")
    }

    @Test func pointOutsideTheGridFindsNothing() {
        #expect(Geo.segment(containing: Position(lat: 0.5, lon: 10.0005, accuracyM: 5), in: grid) == nil)
    }

    @Test func pointOnASharedEdgeGoesToTheLowestId() {
        #expect(Geo.segment(containing: Position(lat: 0.0015, lon: 10.001, accuracyM: 5), in: grid) == "AA")
    }

    @Test func holesAreExcluded() {
        let outer = [[0.0, 0.0], [4, 0], [4, 4], [0, 4], [0, 0]].map { Coordinate(lon: $0[0], lat: $0[1]) }
        let hole = [[1.0, 1.0], [3, 1], [3, 3], [1, 3], [1, 1]].map { Coordinate(lon: $0[0], lat: $0[1]) }
        let seg = GridSegment(segmentId: "H", areaM2: 1, centroid: Coordinate(lon: 0.5, lat: 0.5),
                              geometry: SegmentGeometry(polygons: [[outer, hole]]), neighbors: [], upstream: [], downstream: [])
        #expect(Geo.segment(containing: Position(lat: 2, lon: 2, accuracyM: 1), in: [seg]) == nil)
        #expect(Geo.segment(containing: Position(lat: 0.5, lon: 0.5, accuracyM: 1), in: [seg]) == "H")
    }

    @Test func geometryDecodesGeoJSONPolygonAndMultiPolygon() throws {
        let poly = try SegmentGeometry(geoJSON: #"{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}"#)
        #expect(poly.polygons.count == 1)
        let multi = try SegmentGeometry(geoJSON: #"{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]],[[[5,5],[6,5],[6,6],[5,5]]]]}"#)
        #expect(multi.polygons.count == 2)
        #expect(throws: (any Error).self) { try SegmentGeometry(geoJSON: #"{"type":"Point","coordinates":[0,0]}"#) }
    }

    @Test func bearingPointsEastAndNorth() {
        #expect(abs(Geo.bearingDeg(from: Coordinate(lon: 10, lat: 0), to: Coordinate(lon: 10.001, lat: 0)) - 90) < 1e-9)
        #expect(abs(Geo.bearingDeg(from: Coordinate(lon: 10, lat: 0), to: Coordinate(lon: 10, lat: 0.001))) < 1e-9)
    }
}
