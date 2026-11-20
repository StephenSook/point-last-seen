import Foundation
import Testing
@testable import PLSCore

/// The search map's ink is the web's (web/src/map/poaStyle.ts, theme/tokens.ts, map/credit.ts):
/// probability by the lightness of one warm hue in eight steps, the number printed beside it,
/// never by red and never by hue. The same cases as the web's tests.
@Suite struct MapShadingTests {
    @Test func theClassIsTheShareOfTheLargestInEightSteps() {
        #expect(MapShading.poaClass8(0.31, maxPoa: 0.31) == 7)
        #expect(MapShading.poaClass8(0, maxPoa: 0.31) == 0)
        #expect(MapShading.poaClass8(0.155, maxPoa: 0.31) == 4)
        #expect(MapShading.poaClass8(0.3099, maxPoa: 0.31) == 7)
        #expect(MapShading.poaClass8(0.1, maxPoa: 0) == 0)
        #expect(MapShading.poaClass8(-0.1, maxPoa: 0.31) == 0)
        #expect(MapShading.poaClass8(.nan, maxPoa: 0.31) == 0)
    }

    @Test func thePercentIsPrintedAsOnTheWeb() {
        #expect(MapShading.formatPct(0.1234) == "12.3%")
        #expect(MapShading.formatPct(0.5) == "50.0%")
        #expect(MapShading.formatPct(0.0004) == "<0.1%")
        #expect(MapShading.formatPct(0) == "0%")
    }

    /// The ramp is the web's own, read from its tokens file, so the two cannot drift apart.
    @Test func theRampIsTheWebsRamp() throws {
        let tokens = try String(contentsOf: VectorFile.sharedDir.deletingLastPathComponent()
            .appendingPathComponent("web/src/theme/tokens.ts"), encoding: .utf8)
        guard let line = tokens.split(separator: "\n").first(where: { $0.contains("export const POA_RAMP") }) else {
            Issue.record("no POA_RAMP in tokens.ts"); return
        }
        let hex = try Regex("#[0-9A-Fa-f]{6}")
        let hexes = String(line).matches(of: hex).map { String(String(line)[$0.range]) }
        #expect(hexes == MapShading.poaRamp && hexes.count == 8)
    }

    /// The OpenStreetMap line shows exactly when something drawn from OpenStreetMap is on screen:
    /// the grid's own line when segments are drawn, else the plain one; nothing on an empty map.
    @Test func theCreditShowsWhenOpenStreetMapDataIsDrawn() {
        #expect(MapShading.credit(segments: 3, basemap: false, gridAttribution: "Map data from OpenStreetMap contributors (ODbL)")
                == "Map data from OpenStreetMap contributors (ODbL)")
        #expect(MapShading.credit(segments: 3, basemap: false, gridAttribution: nil) == "Map data from OpenStreetMap")
        #expect(MapShading.credit(segments: 0, basemap: true, gridAttribution: nil) == "Map data from OpenStreetMap")
        #expect(MapShading.credit(segments: 0, basemap: false, gridAttribution: nil) == nil)
    }

    /// Each segment carries its class (relative to the largest in the grid), its printed number and
    /// whether it is the team's. A segment with no value is class 0 with no number.
    @Test func segmentsCarryTheirClassNumberAndTeam() {
        func square(_ id: String) -> GridSegment {
            let ring = [Coordinate(lon: 0, lat: 0), Coordinate(lon: 1, lat: 0), Coordinate(lon: 1, lat: 1), Coordinate(lon: 0, lat: 0)]
            return GridSegment(segmentId: id, areaM2: 1, centroid: Coordinate(lon: 0.5, lat: 0.5),
                               geometry: SegmentGeometry(polygons: [[ring]]), neighbors: [], upstream: [], downstream: [])
        }
        let shaded = MapShading.segments([square("AA"), square("AB"), square("AC")],
                                         poa: ["AA": 0.4, "AB": 0.1], assigned: ["AB"])
        #expect(shaded.map(\.segmentId) == ["AA", "AB", "AC"])
        #expect(shaded.map(\.cls) == [7, 2, 0])
        #expect(shaded.map(\.label) == ["40.0%", "10.0%", ""])
        #expect(shaded.map(\.assigned) == [false, true, false])
        #expect(shaded[0].polygons == [[[Coordinate(lon: 0, lat: 0), Coordinate(lon: 1, lat: 0), Coordinate(lon: 1, lat: 1), Coordinate(lon: 0, lat: 0)]]])
        #expect(MapShading.segments([], poa: [:], assigned: []).isEmpty)
    }
}
