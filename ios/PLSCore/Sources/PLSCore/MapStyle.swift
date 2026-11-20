import Foundation

/// The search map's MapLibre style, in the web map's order (web/src/map/MapView.tsx and
/// web/src/basemap/style.ts): grey ground, the basemap's parks, water and buildings under the
/// probability fills, its streets, paths and streams over them, then segment edges and the team's
/// own outline. No labels: they would need glyphs from a host, and the phone is often offline (the
/// printed numbers are drawn by the app on plates).
public enum MapStyle {
    /// The web's map ink (theme/tokens.ts COMMAND).
    public static let bg0 = "#110F0D", bg1 = "#1C1917", bg2 = "#252220", bg3 = "#302D2B", fg2 = "#D7D3D0", fg4 = "#898583"
    static let lineOpacity = 0.6
    static let greenLanduse = ["park", "garden", "grass", "wood", "forest", "nature_reserve", "golf_course", "cemetery", "playground", "pitch"]

    /// The style; `basemap` is the grid's PMTiles file on the phone, or nil for plain ground.
    public static func style(segments: [MapShading.Segment], basemap: URL?) -> JSONValue {
        var sources: [String: JSONValue] = ["segments": .object(["type": .string("geojson"), "data": features(segments)])]
        var layers: [JSONValue] = [.object(["id": .string("background"), "type": .string("background"),
                                            "paint": .object(["background-color": .string(bg0)])])]
        let source = "basemap"
        if let basemap {
            sources[source] = .object(["type": .string("vector"), "url": .string("pmtiles://" + basemap.absoluteString)])
            layers += [
                fill("bm-landuse", source, layer: "landuse", color: bg1,
                     filter: .array([.string("in"), get("kind"), .array([.string("literal"), .array(greenLanduse.map(JSONValue.string))])])),
                fill("bm-water", source, layer: "water", color: bg3,
                     filter: .array([.string("=="), .array([.string("geometry-type")]), .string("Polygon")])),
                fill("bm-buildings", source, layer: "buildings", color: bg2, filter: nil),
            ]
        }
        var ramp: [JSONValue] = [.string("match"), get("cls")]
        for (i, hex) in MapShading.poaRamp.enumerated() { ramp += [.number(Double(i)), .string(hex)] }
        ramp.append(.string(MapShading.poaRamp[0]))
        layers.append(.object(["id": .string("seg-fill"), "type": .string("fill"), "source": .string("segments"),
                               "paint": .object(["fill-color": .array(ramp), "fill-opacity": .number(0.9)])]))
        if basemap != nil {
            layers += [
                line("bm-streams", source, layer: "water", width: .number(1.4), dashed: false,
                     filter: .array([.string("=="), .array([.string("geometry-type")]), .string("LineString")])),
                line("bm-roads", source, layer: "roads",
                     width: .array([.string("match"), get("kind"), .array([.string("highway"), .string("major_road")]), .number(1.8),
                                    .string("medium_road"), .number(1.4), .number(1)]),
                     dashed: false, filter: .array([.string("!="), get("kind"), .string("path")])),
                line("bm-paths", source, layer: "roads", width: .number(1), dashed: true,
                     filter: .array([.string("=="), get("kind"), .string("path")])),
            ]
        }
        let team: JSONValue = .array([.string("=="), get("assigned"), .bool(true)])
        layers += [
            edge("seg-casing", color: bg0, width: 3, filter: nil),
            edge("seg-line", color: fg4, width: 1, filter: nil),
            edge("team-casing", color: bg0, width: 6, filter: team),
            edge("team-line", color: fg2, width: 2.5, filter: team),
        ]
        return .object(["version": .number(8), "sources": .object(sources), "layers": .array(layers)])
    }

    /// The style as JSON data, for MapLibre.
    public static func json(segments: [MapShading.Segment], basemap: URL?) throws -> Data {
        try JSONEncoder().encode(style(segments: segments, basemap: basemap))
    }

    static func features(_ segments: [MapShading.Segment]) -> JSONValue {
        let list: [JSONValue] = segments.map { s in
            let polygons: [JSONValue] = s.polygons.map { polygon in
                .array(polygon.map { ring in .array(ring.map { .array([.number($0.lon), .number($0.lat)]) }) })
            }
            let geometry: JSONValue = polygons.count == 1
                ? .object(["type": .string("Polygon"), "coordinates": polygons[0]])
                : .object(["type": .string("MultiPolygon"), "coordinates": .array(polygons)])
            return .object(["type": .string("Feature"), "geometry": geometry,
                            "properties": .object(["segmentId": .string(s.segmentId), "cls": .number(Double(s.cls)),
                                                   "label": .string(s.label), "assigned": .bool(s.assigned)])])
        }
        return .object(["type": .string("FeatureCollection"), "features": .array(list)])
    }

    static func get(_ key: String) -> JSONValue { .array([.string("get"), .string(key)]) }

    static func fill(_ id: String, _ source: String, layer: String, color: String, filter: JSONValue?) -> JSONValue {
        var o: [String: JSONValue] = ["id": .string(id), "type": .string("fill"), "source": .string(source),
                                      "source-layer": .string(layer), "paint": .object(["fill-color": .string(color)])]
        if let filter { o["filter"] = filter }
        return .object(o)
    }

    static func line(_ id: String, _ source: String, layer: String, width: JSONValue, dashed: Bool, filter: JSONValue) -> JSONValue {
        var paint: [String: JSONValue] = ["line-color": .string(fg4), "line-width": width, "line-opacity": .number(lineOpacity)]
        if dashed { paint["line-dasharray"] = .array([.number(2), .number(1.5)]) }
        return .object(["id": .string(id), "type": .string("line"), "source": .string(source), "source-layer": .string(layer),
                        "filter": filter, "paint": .object(paint)])
    }

    static func edge(_ id: String, color: String, width: Double, filter: JSONValue?) -> JSONValue {
        var o: [String: JSONValue] = ["id": .string(id), "type": .string("line"), "source": .string("segments"),
                                      "paint": .object(["line-color": .string(color), "line-width": .number(width)])]
        if let filter { o["filter"] = filter }
        return .object(o)
    }
}
