package app.pointlastseen.family.core

import app.pointlastseen.family.data.SubjectProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NineOneOneScriptTest {
    private val p = SubjectProfile(
        answersTo = "Mae", nickname = "Mama Mae", ageYears = 82, gender = "female", heightFt = 5, heightIn = 2, weightLb = 130,
        hair = "grey", eyeColor = "brown", primaryLanguage = "English", clothingLastWorn = "blue coat",
        mobilityAids = setOf("cane"), dementiaType = "lewy_body", flags = setOf("mayNotRespond", "carriesMedicalAlertCard"),
        medications = "donepezil", appearance = "short grey curls",
    )

    @Test fun inADrillTheFirstLineSaysDoNotDial911() {
        assertEquals("Training drill. Do not dial 911.", NineOneOneScript.lines(p, mode = "drill").first())
        assertEquals("Training drill. Do not dial 911.", NineOneOneScript.lines(p, mode = "judge").first())
    }

    @Test fun outsideADrillItOpensWithWhatToTellTheCallTaker() {
        assertEquals("Tell the call-taker:", NineOneOneScript.lines(p, mode = null).first())
    }

    @Test fun theScriptCarriesWhatACallTakerAsksFor() {
        val text = NineOneOneScript.lines(p, null).joinToString("\n")
        for (s in listOf("Mae", "82", "5 feet 2 inches", "130 pounds", "grey", "brown", "blue coat", "cane", "dementia", "may not answer", "donepezil", "medical alert card", "English")) {
            assertTrue(s, text.contains(s))
        }
    }

    @Test fun emptyFieldsAreLeftOutNotPrintedAsBlanks() {
        val text = NineOneOneScript.lines(SubjectProfile(answersTo = "Mae"), null).joinToString("\n")
        assertFalse(text.contains("null"))
        assertFalse(text.contains("Height"))
        assertFalse(text.contains("Medicines"))
        assertTrue(text.contains("Mae"))
    }

    @Test fun theLastSeenTimeAndPlaceAreLeftForTheFamilyToSay() {
        assertTrue(NineOneOneScript.lines(p, null).any { it.startsWith("Last seen:") })
    }
}
