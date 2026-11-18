package app.pointlastseen.family.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenceScreenTest {
    private val screen = EvidenceScreen(listOf("blood", "shell casing", "duct tape"))

    @Test fun aSingleWordTermMatches() {
        assertTrue(screen.isPossibleEvidence("There was BLOOD on a rock"))
    }

    @Test fun aMultiWordTermMatchesOnlyWhenConsecutive() {
        assertTrue(screen.isPossibleEvidence("found a shell-casing by the path"))
        assertFalse(screen.isPossibleEvidence("a shell and a casing"))
    }

    @Test fun wordsMatchWholeNotAsPrefixes() {
        assertFalse(screen.isPossibleEvidence("bloodhound team went north"))
    }

    @Test fun ordinaryNotesPass() {
        assertFalse(screen.isPossibleEvidence("She likes to walk to the old mill"))
    }

    @Test fun missingTermsFailClosed() {
        assertTrue(EvidenceScreen(null).isPossibleEvidence("She likes to walk to the old mill"))
    }

    @Test fun termsParseFromTheSharedFile() {
        val json = """{"schemaVersion":1,"terms":["blood","zip tie"]}"""
        val parsed = EvidenceScreen.parseTerms(json)
        assertTrue(EvidenceScreen(parsed).isPossibleEvidence("a zip tie on the fence"))
        assertTrue(EvidenceScreen(EvidenceScreen.parseTerms("not json")).isPossibleEvidence("ok"))
    }
}
