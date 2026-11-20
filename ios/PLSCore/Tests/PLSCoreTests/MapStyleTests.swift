import Foundation
import Testing
@testable import PLSCore

/// The search map's style, in the web map's order (web/src/map/MapView.tsx, web/src/basemap/style.ts):
/// grey ground, the basemap's shapes under the fills, the probability fills, streets, paths and
/// streams over them, then segment edges and the team's outline. No labels: they would need glyphs
/// from a host, and the phone is often offline.
@Suite struct MapStyleTests {
    func segments() -> [MapShading.Segment] {
        let ring = [Coordinate(lon: -84.6, lat: 33.9), Coordinate(lon: -84.59, lat: 33.9), Coordinate(lon: -84.59, lat: 33.91), Coordinate(lon: -84.6, lat: 33.9)]
        return [
            MapShading.Segment(segmentId: "AA", polygons: [[ring]], cls: 7, label: "40.0%", assigned: true),
            MapShading.Segment(segmentId: "AB", polygons: [[ring], [ring]], cls: 0, label: "", assigned: false),
        ]
    }

    func layerIds(_ style: JSONValue) -> [String] {
        guard case let .array(layers)? = style["layers"] else { return [] }
        return layers.compactMap { if case let .string(id)? = $0["id"] { id } else { nil } }
    }

    func layer(_ style: JSONValue, _ id: String) -> JSONValue? {
        guard case let .array(layers)? = style["layers"] else { return nil }
        return layers.first { $0["id"] == .string(id) }
    }

    @Test func withoutTilesTheFillsSitOnPlainGround() {
        let style = MapStyle.style(segments: segments(), basemap: nil)
        #expect(layerIds(style) == ["background", "seg-fill", "seg-casing", "seg-line", "team-casing", "team-line"])
        guard case let .object(sources)? = style["sources"] else { Issue.record("no sources"); return }
        #expect(Array(sources.keys) == ["segments"])
        #expect(layer(style, "background")?["paint"]?["background-color"] == .string("#110F0D"))
    }

    @Test func withTilesTheBasemapShapesGoUnderAndItsLinesOver() {
        let file = URL(fileURLWithPath: "/tmp/kennesaw-mountain-drill.pmtiles")
        let style = MapStyle.style(segments: segments(), basemap: file)
        #expect(layerIds(style) == ["background", "bm-landuse", "bm-water", "bm-buildings", "seg-fill",
                                    "bm-streams", "bm-roads", "bm-paths", "seg-casing", "seg-line", "team-casing", "team-line"])
        #expect(style["sources"]?["basemap"]?["type"] == .string("vector"))
        #expect(style["sources"]?["basemap"]?["url"] == .string("pmtiles://file:///tmp/kennesaw-mountain-drill.pmtiles"))
        #expect(layer(style, "bm-roads")?["source-layer"] == .string("roads"))
    }

    /// Probability by the lightness of one warm hue: class 0 to 7 picks the web's ramp.
    @Test func theFillColourIsTheRampByClass() {
        let style = MapStyle.style(segments: segments(), basemap: nil)
        var expected: [JSONValue] = [.string("match"), .array([.string("get"), .string("cls")])]
        for (i, hex) in MapShading.poaRamp.enumerated() { expected += [.number(Double(i)), .string(hex)] }
        expected.append(.string(MapShading.poaRamp[0]))
        #expect(layer(style, "seg-fill")?["paint"]?["fill-color"] == .array(expected))
        #expect(layer(style, "seg-fill")?["paint"]?["fill-opacity"] == .number(0.9))
    }

    @Test func eachSegmentIsAFeatureWithItsClassAndTeam() {
        let style = MapStyle.style(segments: segments(), basemap: nil)
        guard case let .array(features)? = style["sources"]?["segments"]?["data"]?["features"] else { Issue.record("no features"); return }
        #expect(features.count == 2)
        #expect(features[0]["properties"]?["segmentId"] == .string("AA"))
        #expect(features[0]["properties"]?["cls"] == .number(7))
        #expect(features[0]["properties"]?["assigned"] == .bool(true))
        #expect(features[0]["geometry"]?["type"] == .string("Polygon"))
        #expect(features[1]["geometry"]?["type"] == .string("MultiPolygon"))
        guard case let .array(rings)? = features[0]["geometry"]?["coordinates"], case let .array(ring)? = rings.first,
              case let .array(point)? = ring.first else { Issue.record("no coordinates"); return }
        #expect(point == [.number(-84.6), .number(33.9)])
    }

    @Test func onlyTheTeamsSegmentsAreOutlined() {
        let style = MapStyle.style(segments: segments(), basemap: nil)
        let filter: JSONValue = .array([.string("=="), .array([.string("get"), .string("assigned")]), .bool(true)])
        #expect(layer(style, "team-casing")?["filter"] == filter && layer(style, "team-line")?["filter"] == filter)
    }

    @Test func theStyleIsValidJSON() throws {
        let data = try MapStyle.json(segments: segments(), basemap: nil)
        let back = try JSONDecoder().decode(JSONValue.self, from: data)
        #expect(back["version"] == .number(8))
    }
}
