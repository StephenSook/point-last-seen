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

    @Test func theAppBundleCarriesTheApproachNotes() throws {
        let notes = try BundledConstants.approachNotes()
        #expect(notes.firstScreenMax == 7)
        #expect(notes.order.first == "may_not_respond")
        #expect(notes.footer.hasSuffix("Not medical advice."))
    }

    @Test func theAppBundleCarriesTheUrgencyRule() throws {
        let rule = try BundledConstants.urgencyRule()
        #expect(rule.coldF == 40)
        #expect(rule.sourceLine.hasPrefix("CDC: "))
    }
}

