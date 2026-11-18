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

@Suite struct EvidenceScreenBypassTests {
    let screen = EvidenceScreen(terms: ["blood", "shell casing"])

    @Test func possessivesAndQuotesStillMatch() {
        #expect(screen.isPossibleEvidence("the blood's on the rock"))
        #expect(screen.isPossibleEvidence("I saw 'blood' there"))
        #expect(screen.isPossibleEvidence("blood\u{2019}s on the rock"))          // curly apostrophe
        #expect(screen.isPossibleEvidence("a shell casing's by the road"))
    }

    @Test func accentsAndFullWidthLettersAreFolded() {
        #expect(screen.isPossibleEvidence("BL\u{00D3}OD on the trail"))            // O with acute accent
        #expect(screen.isPossibleEvidence("\u{FF42}\u{FF4C}\u{FF4F}\u{FF4F}\u{FF44} near the creek"))  // full-width letters
    }
}
