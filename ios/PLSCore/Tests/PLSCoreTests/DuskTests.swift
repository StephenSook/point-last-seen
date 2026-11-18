import Foundation
import Testing
@testable import PLSCore

@Suite struct DuskTests {
    func utc(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        return f.date(from: s)!
    }

    @Test func duskFlipsAroundSunsetInAtlantaInNovember() {
        #expect(Dusk.isAfterCivilDusk(date: utc("2026-11-22T20:00:00Z"), lat: 33.9, lon: -84.5) == false)
        #expect(Dusk.isAfterCivilDusk(date: utc("2026-11-23T00:30:00Z"), lat: 33.9, lon: -84.5) == true)
    }

    @Test func beforeDawnIsStillNight() {
        #expect(Dusk.isAfterCivilDusk(date: utc("2026-11-23T10:00:00Z"), lat: 33.9, lon: -84.5) == true)     // 05:00 local
        #expect(Dusk.isAfterCivilDusk(date: utc("2026-11-23T14:00:00Z"), lat: 33.9, lon: -84.5) == false)    // 09:00 local
    }
}
