import Foundation
import PLSCore
import SwiftUI
import Testing
@testable import PLS

@MainActor
@Suite struct ThemeStoreTests {
    func defaults() -> UserDefaults {
        let name = "pls.theme.test.\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    @Test func theChosenModeIsKeptOnThisPhone() {
        let d = defaults()
        let store = ThemeStore(defaults: d)
        #expect(store.mode == .auto)
        store.mode = .night
        #expect(ThemeStore(defaults: d).mode == .night)
    }

    @Test func anUnknownStoredValueFallsBackToAuto() {
        let d = defaults()
        d.set("sepia", forKey: ThemeStore.key)
        #expect(ThemeStore(defaults: d).mode == .auto)
    }

    @Test func thePlaceIsTheLastFixThenThePackArea() {
        let cell = GridSegment(segmentId: "AA", areaM2: 1, centroid: Coordinate(lon: -84.4, lat: 33.8),
                               geometry: SegmentGeometry(polygons: []), neighbors: [], upstream: [], downstream: [])
        #expect(ThemeStore.place(lastFix: Position(lat: 34, lon: -84, accuracyM: 10), grid: [cell]) == Coordinate(lon: -84, lat: 34))
        #expect(ThemeStore.place(lastFix: nil, grid: [cell]) == Coordinate(lon: -84.4, lat: 33.8))
        #expect(ThemeStore.place(lastFix: nil, grid: []) == nil)
    }

    @Test func hexColoursParseToTheirChannels() {
        let c = FieldColor.rgb("#FFB020")
        #expect(c == FieldColor.RGB(red: 1.0, green: 176.0 / 255, blue: 32.0 / 255))
        #expect(FieldColor.rgb("nope") == FieldColor.RGB(red: 0, green: 0, blue: 0))
    }
}
