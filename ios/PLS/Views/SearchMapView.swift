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

    /// OpenStreetMap's own short form, on one line, with the basemap's source when its tiles are drawn;
    /// a tap shows the full sentence (`credit`).
    static func shortCredit(segments: Int, basemap: Bool) -> String? {
        guard segments > 0 || basemap else { return nil }
        return basemap ? "© OpenStreetMap contributors · Protomaps" : "© OpenStreetMap contributors"
    }

    /// The numbers drawn: the posterior after this phone's reports, else the pack's prior.
    static func poa(_ mission: Mission, posterior: PosteriorResult?) -> [String: Double] {
        posterior?.poa ?? Dictionary(mission.prior.map { ($0.segmentId, $0.priorPoa) }, uniquingKeysWith: { first, _ in first })
    }
}

/// The team's search map: every segment shaded by probability in the web map's ramp, the team's
/// own segments outlined thick with a team plate, a number plate only where it helps (see
/// `MapPlates`), and the OpenStreetMap line. Drawn on the grid's offline tiles when the app carries
/// them, else on plain ground.
struct SearchMapScreen: View {
    let mission: Mission
    let posterior: PosteriorResult?
    @State private var fullCredit = false
    var body: some View {
        let tiles = SearchMap.tiles(gridId: mission.gridId)
        let poa = SearchMap.poa(mission, posterior: posterior)
        let shaded = MapShading.segments(mission.grid, poa: poa, assigned: Set(mission.assignedSegmentIds))
        ZStack(alignment: .bottomLeading) {
            SearchMapLayer(segments: shaded, grid: mission.grid, tiles: tiles,
                           plates: MapPlates.plates(shaded, poa: poa, teamId: mission.teamId))
                .ignoresSafeArea(edges: .bottom)
            if let full = SearchMap.credit(mission, segments: shaded.count, basemap: tiles != nil),
               let short = SearchMap.shortCredit(segments: shaded.count, basemap: tiles != nil) {
                // One line in the corner, so it never covers the search area; a tap shows the full sentence.
                Text(fullCredit ? full : short)
                    .font(.system(size: 13, weight: .semibold)) // Map credit (legal text, never instructions): at least 13 pt.
                    .lineLimit(fullCredit ? nil : 1)
                    // The map's own muted grey in every screen mode (the night mode's red reads as an alarm).
                    .foregroundStyle(mapColor(MapStyle.fg4))
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(mapColor(MapStyle.bg0).opacity(0.85), in: RoundedRectangle(cornerRadius: 5))
                    .padding(6)
                    .onTapGesture { fullCredit.toggle() }
                    .accessibilityLabel(full)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityIdentifier("map-credit")
            }
        }
        .fieldNavigation("Map")
    }
}

/// MapLibre with the shared style, fitted to the grid, with the plates.
struct SearchMapLayer: UIViewRepresentable {
    let segments: [MapShading.Segment]
    let grid: [GridSegment]
    let tiles: URL?
    let plates: [MapPlates.Plate]

    func makeUIView(context: Context) -> PlateMapView {
        let map = PlateMapView(frame: .zero, styleURL: styleFile())
        map.logoView.isHidden = true
        map.attributionButton.isHidden = true          // the OpenStreetMap line is drawn by the screen
        map.accessibilityIdentifier = "search-map"
        let rings = Dictionary(grid.map { ($0.segmentId, $0.geometry.polygons.flatMap { $0.flatMap { $0 } }) },
                               uniquingKeysWith: { first, _ in first })
        let plateDelegate = PlateDelegate(bounds: Self.bounds(grid), rings: rings)
        map.plateDelegate = plateDelegate
        map.delegate = plateDelegate
        map.addAnnotations(annotations())
        return map
    }

    func updateUIView(_ map: PlateMapView, context: Context) {}

    /// The style written where MapLibre can read it.
    private func styleFile() -> URL? {
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("search-map-style.json")
        guard let data = try? MapStyle.json(segments: segments, basemap: tiles), (try? data.write(to: url)) != nil else { return nil }
        return url
    }

    /// One annotation per plate, at its segment's centre.
    private func annotations() -> [PlateAnnotation] {
        let centres = Dictionary(grid.map { ($0.segmentId, $0.centroid) }, uniquingKeysWith: { first, _ in first })
        return plates.compactMap { plate in
            guard let c = centres[plate.segmentId] else { return nil }
            let a = PlateAnnotation(plate: plate)
            a.coordinate = CLLocationCoordinate2D(latitude: c.lat, longitude: c.lon)
            a.title = plate.text
            return a
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
}

/// The map view keeps its plate delegate (MapLibre holds the delegate weakly).
final class PlateMapView: MLNMapView {
    var plateDelegate: PlateDelegate?
}

final class PlateAnnotation: MLNPointAnnotation {
    let plate: MapPlates.Plate
    init(plate: MapPlates.Plate) {
        self.plate = plate
        super.init()
    }
    required init?(coder: NSCoder) { nil }
}

/// Draws the plates (the number on a dark plate, never on the fill; the team's plate inverted) and,
/// after every move, hides each other plate that would not fit inside its segment on screen.
@MainActor
final class PlateDelegate: NSObject, @preconcurrency MLNMapViewDelegate {
    let bounds: MLNCoordinateBounds?
    let rings: [String: [Coordinate]]
    init(bounds: MLNCoordinateBounds?, rings: [String: [Coordinate]]) {
        self.bounds = bounds
        self.rings = rings
    }

    /// Fitted to the grid once the map has its size and style.
    func mapViewDidFinishLoadingMap(_ mapView: MLNMapView) {
        guard let bounds else { return }
        mapView.setVisibleCoordinateBounds(bounds, edgePadding: UIEdgeInsets(top: 32, left: 24, bottom: 72, right: 24), animated: false)
        fitPlates(mapView)
    }

    func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) { fitPlates(mapView) }

    func fitPlates(_ mapView: MLNMapView) {
        for case let a as PlateAnnotation in mapView.annotations ?? [] {
            guard let view = mapView.view(for: a) else { continue }
            let points = (rings[a.plate.segmentId] ?? []).map {
                mapView.convert(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon), toPointTo: mapView)
            }
            let xs = points.map(\.x), ys = points.map(\.y)
            let width = (xs.max() ?? 0) - (xs.min() ?? 0), height = (ys.max() ?? 0) - (ys.min() ?? 0)
            view.isHidden = !MapPlates.shows(a.plate, plateWidth: view.bounds.width, plateHeight: view.bounds.height,
                                             segmentWidth: width, segmentHeight: height)
        }
    }

    func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
        guard let a = annotation as? PlateAnnotation else { return nil }
        let id = a.plate.team ? "team-plate" : "plate"
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: id) ?? MLNAnnotationView(reuseIdentifier: id)
        view.subviews.forEach { $0.removeFromSuperview() }
        let label = UILabel()
        label.text = a.plate.text
        label.font = UIFontMetrics(forTextStyle: .title3).scaledFont(for: .monospacedDigitSystemFont(
            ofSize: UIFont.preferredFont(forTextStyle: .title3).pointSize, weight: .bold))
        label.textColor = UIColor(mapColor(a.plate.team ? MapStyle.bg0 : MapStyle.fg2))
        label.textAlignment = .center
        label.sizeToFit()
        view.frame = CGRect(origin: .zero, size: CGSize(width: label.bounds.width + 12, height: label.bounds.height + 4))
        label.frame = view.bounds
        view.backgroundColor = UIColor(mapColor(a.plate.team ? MapStyle.fg2 : MapStyle.bg0))
        view.layer.cornerRadius = 4
        view.addSubview(label)
        view.isAccessibilityElement = true
        view.accessibilityLabel = a.plate.text
        return view
    }

    func mapView(_ mapView: MLNMapView, annotationCanShowCallout annotation: MLNAnnotation) -> Bool { false }
}

/// A "#RRGGBB" map token as a colour (the web map's ink).
private func mapColor(_ hex: String) -> Color {
    let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}
