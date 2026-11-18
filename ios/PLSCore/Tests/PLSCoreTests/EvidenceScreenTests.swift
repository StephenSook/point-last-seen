import Testing
@testable import PLSCore

@Suite struct EvidenceScreenTests {
    let screen = EvidenceScreen(terms: ["blood", "weapon", "shell casing"])

    @Test func wholeWordsMatchCaseInsensitively() {
        #expect(screen.isPossibleEvidence("there is blood on a rock by the creek"))
        #expect(screen.isPossibleEvidence("BLOOD-stained cloth"))
        #expect(screen.isPossibleEvidence("found a Shell  Casing near the road"))
    }

    @Test func partsOfWordsDoNotMatch() {
        #expect(screen.isPossibleEvidence("bloodhound team cleared AC") == false)
        #expect(screen.isPossibleEvidence("a shell by the creek") == false)
        #expect(screen.isPossibleEvidence("cleared segment AC") == false)
        #expect(screen.isPossibleEvidence("") == false)
    }

    @Test func emptyTermListMatchesNothing() {
        #expect(EvidenceScreen(terms: []).isPossibleEvidence("blood") == false)
    }
}
