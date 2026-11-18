import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct BundledConstantsTests {
    @Test func theAppBundleCarriesTheSharedEvidenceTerms() throws {
        let screen = try BundledConstants.evidenceScreen()
        #expect(screen.isPossibleEvidence("there is blood on a rock by the creek"))
        #expect(screen.isPossibleEvidence("cleared segment AC") == false)
    }

    @Test func theAppBundleCarriesTheSharedEngineNumbers() throws {
        let p = try BundledConstants.engineParams()
        #expect(p.sweepWidthFactor == 1.645)
        #expect(p.secondsPerMinute == 60)
        #expect(p.detectionProfile.soundCounts == false)
    }
}
