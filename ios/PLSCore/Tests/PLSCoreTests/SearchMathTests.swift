import Testing
@testable import PLSCore

@Suite struct SearchMathTests {
    @Test func podOfCoverageOneIsFrost() {
        #expect(near(SearchMath.pod(coverage: 1.0), 0.6321205588285577))
    }

    @Test func trackLengthUsesSecondsNotMinutes() {
        // 0.39 m/s x (30 x 60) s x 4 searchers
        #expect(near(SearchMath.trackLength(minutes: 30, searchers: 4, searchType: .sweep, params: params), 2808.0))
        #expect(near(SearchMath.trackLength(minutes: 30, searchers: 4, searchType: .hasty, params: params), 0.53 * 1800 * 4))
    }

    @Test func unknownSearchTypeUsesTheSlowerSweepSpeed() {
        #expect(near(SearchMath.trackLength(minutes: 10, searchers: 1, searchType: .unknown, params: params), 0.39 * 600))
    }

    @Test func worked45MinuteSweepGivesAbout40Percent() {
        let w = SearchMath.sweepWidth(detectionRangeM: 10, params: params)
        let l = SearchMath.trackLength(minutes: 45, searchers: 3, searchType: .sweep, params: params)
        let c = SearchMath.coverage(sweepWidthM: w, trackLengthM: l, areaM2: 100_000)
        #expect(near(w, 16.45))
        #expect(near(l, 3159.0))
        #expect(near(c, 0.5196555))
        let p = SearchMath.pod(coverage: c)
        #expect(p > 0.40 && p < 0.41)
    }

    @Test func iocAgainstAtMediumAuthenticity() {
        #expect(near(SearchMath.ioc(.against, authenticity: .medium, params: params), 0.64))
        #expect(near(SearchMath.ioc(.strongFor, authenticity: .high, params: params), 1.0))
        #expect(near(SearchMath.ioc(.strongAgainst, authenticity: .low, params: params), 1.0))
    }

    @Test func coverageEightyBecomesPointEight() {
        #expect(SearchMath.normalizeCoverage(80) == .ratio(0.8))
        #expect(SearchMath.normalizeCoverage(0.8) == .ratio(0.8))
        #expect(SearchMath.normalizeCoverage(150) == .ratio(1.5))
        #expect(SearchMath.normalizeCoverage(3) == .ratio(3))
        #expect(SearchMath.normalizeCoverage(300) == .ratio(3))
        #expect(SearchMath.normalizeCoverage(400) == .invalid)
        #expect(SearchMath.normalizeCoverage(-1) == .invalid)
        #expect(SearchMath.normalizeCoverage(.nan) == .invalid)
        #expect(SearchMath.normalizeCoverage(.infinity) == .invalid)
        #expect(SearchMath.normalizeCoverage(nil) == .none)
    }
}
