import MapLibre
import PLSCore
import SwiftUI

/// The search map's choices, kept apart from drawing so they can be tested.
enum SearchMap {
    /// The grid's offline tiles in the app bundle; nil for a grid the app does not carry.
    static func tiles(gridId: String?, bundle: Bundle = .main) -> URL? {
        gridId.flatMap { bundle.url(forResource: $0, withExtension: "pmtiles") }
    }

    /// The OpenStreetMap line (ODbL) whenever segments are drawn, with the basemap's source when
    /// its tiles are drawn too.
    static func credit(_ mission: Mission, segments: Int, basemap: Bool) -> String? {
        guard let line = MapShading.credit(segments: segments, basemap: basemap, gridAttribution: mission.gridAttribution) else { return nil }
        return basemap ? line + ". Basemap: Protomaps." : line
    }

    /// The numbers drawn: the posterior after this phone's reports, else the pack's prior.
    static func poa(_ mission: Mission, posterior: PosteriorResult?) -> [String: Double] {
        posterior?.poa ?? Dictionary(mission.prior.map { ($0.segmentId, $0.priorPoa) }, uniquingKeysWith: { first, _ in first })
    }
}

/// The team's search map: every segment shaded by probability in the web map's ramp, the team's
/// own segments outlined, the printed number on a plate at each centre, and the OpenStreetMap line.
/// Drawn on the grid's offline tiles when the app carries them, else on plain ground.
struct SearchMapScreen: View {
    let mission: Mission
    let posterior: PosteriorResult?
    @Environment(\.fieldTheme) private var theme

    var body: some View {
        let tiles = SearchMap.tiles(gridId: mission.gridId)
        let shaded = MapShading.segments(mission.grid, poa: SearchMap.poa(mission, posterior: posterior),
                                         assigned: Set(mission.assignedSegmentIds))
        ZStack(alignment: .bottomLeading) {
            SearchMapLayer(segments: shaded, grid: mission.grid, tiles: tiles)
                .ignoresSafeArea(edges: .bottom)
            if let credit = SearchMap.credit(mission, segments: shaded.count, basemap: tiles != nil) {
                Text(credit)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(theme.text(.primary))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(mapColor(MapStyle.bg0).opacity(0.85), in: RoundedRectangle(cornerRadius: 6))
                    .padding(8)
                    .accessibilityIdentifier("map-credit")
            }
        }
        .fieldNavigation("Map")
    }
}

/// MapLibre with the shared style, fitted to the grid.
struct SearchMapLayer: UIViewRepresentable {
    let segments: [MapShading.Segment]
    let grid: [GridSegment]
    let tiles: URL?

    func makeCoordinator() -> Coordinator { Coordinator(bounds: Self.bounds(grid)) }

    func makeUIView(context: Context) -> MLNMapView {
        let map = MLNMapView(frame: .zero, styleURL: styleFile())
        map.logoView.isHidden = true
        map.attributionButton.isHidden = true          // the OpenStreetMap line is drawn by the screen
        map.delegate = context.coordinator
        map.accessibilityIdentifier = "search-map"
        map.addAnnotations(plates())
        return map
    }

    func updateUIView(_ map: MLNMapView, context: Context) {}

    /// The style written where MapLibre can read it; nil (MapLibre's own default) never happens
    /// for a style PLSCore built.
    private func styleFile() -> URL? {
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("search-map-style.json")
        guard let data = try? MapStyle.json(segments: segments, basemap: tiles), (try? data.write(to: url)) != nil else { return nil }
        return url
    }

    /// One plate per segment that has a number, at the segment's centre.
    private func plates() -> [MLNPointAnnotation] {
        let centres = Dictionary(grid.map { ($0.segmentId, $0.centroid) }, uniquingKeysWith: { first, _ in first })
        return segments.compactMap { s in
            guard !s.label.isEmpty, let c = centres[s.segmentId] else { return nil }
            let plate = MLNPointAnnotation()
            plate.coordinate = CLLocationCoordinate2D(latitude: c.lat, longitude: c.lon)
            plate.title = s.label
            return plate
        }
    }

    static func bounds(_ grid: [GridSegment]) -> MLNCoordinateBounds? {
        let points = grid.flatMap { $0.geometry.polygons.flatMap { $0.flatMap { $0 } } }
        guard let first = points.first else { return nil }
        var sw = first, ne = first
        for p in points {
            sw = Coordinate(lon: min(sw.lon, p.lon), lat: min(sw.lat, p.lat))
            ne = Coordinate(lon: max(ne.lon, p.lon), lat: max(ne.lat, p.lat))
        }
        return MLNCoordinateBounds(sw: CLLocationCoordinate2D(latitude: sw.lat, longitude: sw.lon),
                                   ne: CLLocationCoordinate2D(latitude: ne.lat, longitude: ne.lon))
    }

    /// Plates: the printed number on a dark plate (never on the fill itself), as on the web.
    final class Coordinator: NSObject, MLNMapViewDelegate {
        let bounds: MLNCoordinateBounds?
        init(bounds: MLNCoordinateBounds?) { self.bounds = bounds }

        /// Fitted to the grid once the map has its size and style.
        func mapViewDidFinishLoadingMap(_ mapView: MLNMapView) {
            guard let bounds else { return }
            mapView.setVisibleCoordinateBounds(bounds, edgePadding: UIEdgeInsets(top: 32, left: 24, bottom: 56, right: 24), animated: false)
        }

        func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
            let id = "plate"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: id) ?? MLNAnnotationView(reuseIdentifier: id)
            view.subviews.forEach { $0.removeFromSuperview() }
            let label = UILabel()
            label.text = annotation.title ?? ""
            label.font = .monospacedDigitSystemFont(ofSize: 13, weight: .bold)
            label.textColor = UIColor(mapColor(MapStyle.fg2))
            label.textAlignment = .center
            label.sizeToFit()
            let size = CGSize(width: label.bounds.width + 10, height: label.bounds.height + 4)
            view.frame = CGRect(origin: .zero, size: size)
            label.frame = view.bounds
            view.backgroundColor = UIColor(mapColor(MapStyle.bg0))
            view.layer.cornerRadius = 4
            view.addSubview(label)
            view.isAccessibilityElement = true
            view.accessibilityLabel = annotation.title ?? ""
            return view
        }

        func mapView(_ mapView: MLNMapView, annotationCanShowCallout annotation: MLNAnnotation) -> Bool { false }
    }
}

/// A "#RRGGBB" map token as a colour (the web map's ink).
private func mapColor(_ hex: String) -> Color {
    let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}
