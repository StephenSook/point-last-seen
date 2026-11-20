import Foundation
import Testing
@testable import PLSCore

/// Which number plates the search map draws: the team's own segments always (with the team id, so
/// a searcher finds their segment at a glance), any other segment only at 1% or more and only when
/// its plate fits inside the segment at the current zoom. Never a "<0.1%" plate.
@Suite struct MapPlatesTests {
    func segment(_ id: String, cls: Int = 0, label: String, assigned: Bool) -> MapShading.Segment {
        MapShading.Segment(segmentId: id, polygons: [], cls: cls, label: label, assigned: assigned)
    }

    @Test func theTeamsSegmentsAlwaysHaveAPlateWithTheTeamId() {
        let plates = MapPlates.plates([segment("BO", label: "1.4%", assigned: true), segment("BP", label: "<0.1%", assigned: true),
                                       segment("BQ", label: "", assigned: true)],
                                      poa: ["BO": 0.014, "BP": 0.0004], teamId: "T1")
        #expect(plates.map(\.text) == ["T1 1.4%", "T1", "T1"])
        #expect(plates.filter { !$0.team }.isEmpty)
    }

    @Test func otherSegmentsNeedOnePercentAndNeverShowTheSmallestNumbers() {
        let plates = MapPlates.plates([segment("AA", label: "1.0%", assigned: false), segment("AB", label: "0.9%", assigned: false),
                                       segment("AC", label: "<0.1%", assigned: false), segment("AD", label: "12.5%", assigned: false)],
                                      poa: ["AA": 0.01, "AB": 0.009, "AC": 0.0002, "AD": 0.125], teamId: "T1")
        #expect(plates.map(\.segmentId) == ["AA", "AD"] && plates.map(\.text) == ["1.0%", "12.5%"])
        #expect(!plates.contains { $0.text.contains("<0.1%") })
    }

    /// A plate that would not fit inside its segment at this zoom is hidden, never clipped; the
    /// team's plate always shows.
    @Test func aPlateShowsOnlyWhenItFitsItsSegment() {
        let other = MapPlates.Plate(segmentId: "AD", text: "12.5%", team: false)
        let mine = MapPlates.Plate(segmentId: "BO", text: "T1 1.4%", team: true)
        #expect(MapPlates.shows(other, plateWidth: 40, plateHeight: 18, segmentWidth: 60, segmentHeight: 30))
        #expect(!MapPlates.shows(other, plateWidth: 40, plateHeight: 18, segmentWidth: 38, segmentHeight: 30))
        #expect(!MapPlates.shows(other, plateWidth: 40, plateHeight: 18, segmentWidth: 60, segmentHeight: 17))
        #expect(MapPlates.shows(mine, plateWidth: 40, plateHeight: 18, segmentWidth: 10, segmentHeight: 10))
    }
}
