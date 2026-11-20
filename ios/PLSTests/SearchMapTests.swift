import Foundation
import PLSCore
import Testing
@testable import PLS

/// The search map screen's choices: which offline tiles, which numbers, and the OpenStreetMap line.
@MainActor
@Suite struct SearchMapTests {
    func mission(gridId: String?, attribution: String?) throws -> Mission {
        var m = Mission(incidentId: "drill-kennesaw-1", mode: "drill", teamId: "T1", priorVersion: 2, grid: [],
                        prior: [SegmentPrior(segmentId: "AA", priorPoa: 0.3), SegmentPrior(segmentId: "AB", priorPoa: 0.1)],
                        assignedSegmentIds: ["AA"], params: try BundledConstants.engineParams(),
                        profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget)
        m.gridId = gridId
        m.gridAttribution = attribution
        return m
    }

    /// The app carries both drill grids' tiles; another grid, or none, draws on plain ground.
    @Test func theTilesArePickedByTheGridId() {
        #expect(SearchMap.tiles(gridId: "kennesaw-mountain-drill")?.lastPathComponent == "kennesaw-mountain-drill.pmtiles")
        #expect(SearchMap.tiles(gridId: "piedmont-park-dev")?.lastPathComponent == "piedmont-park-dev.pmtiles")
        #expect(SearchMap.tiles(gridId: "somewhere-else") == nil)
        #expect(SearchMap.tiles(gridId: nil) == nil)
    }

    /// The OpenStreetMap line shows whenever segments are drawn: the grid's own line, and the
    /// basemap's source when the tiles are drawn.
    @Test func theCreditNamesOpenStreetMapAndTheBasemap() throws {
        let line = "Map data from OpenStreetMap contributors (ODbL)"
        #expect(SearchMap.credit(try mission(gridId: "kennesaw-mountain-drill", attribution: line), segments: 3, basemap: true)
                == "Map data from OpenStreetMap contributors (ODbL). Basemap: Protomaps.")
        #expect(SearchMap.credit(try mission(gridId: nil, attribution: line), segments: 3, basemap: false) == line)
        #expect(SearchMap.credit(try mission(gridId: nil, attribution: nil), segments: 3, basemap: false) == "Map data from OpenStreetMap")
        #expect(SearchMap.credit(try mission(gridId: nil, attribution: nil), segments: 0, basemap: false) == nil)
    }

    /// The credit on the map is OpenStreetMap's own short form on one line; a tap shows the full
    /// sentence above. Nothing when nothing from OpenStreetMap is drawn.
    @Test func theShortCreditIsOneLine() {
        #expect(SearchMap.shortCredit(segments: 3, basemap: true) == "© OpenStreetMap contributors · Protomaps")
        #expect(SearchMap.shortCredit(segments: 3, basemap: false) == "© OpenStreetMap contributors")
        #expect(SearchMap.shortCredit(segments: 0, basemap: false) == nil)
    }

    /// The numbers are the posterior after this phone's reports, else the pack's prior.
    @Test func theNumbersAreThePosteriorElseThePrior() throws {
        let m = try mission(gridId: nil, attribution: nil)
        #expect(SearchMap.poa(m, posterior: nil) == ["AA": 0.3, "AB": 0.1])
        let posterior = try JSONDecoder().decode(PosteriorResult.self, from: Data("""
            {"poa": {"AA": 0.2, "AB": 0.15}, "remainingMass": {}, "cumulativePod": {}, "appliedEventIds": ["e1"], "ignoredEventIds": []}
            """.utf8))
        #expect(SearchMap.poa(m, posterior: posterior) == ["AA": 0.2, "AB": 0.15])
    }
}
