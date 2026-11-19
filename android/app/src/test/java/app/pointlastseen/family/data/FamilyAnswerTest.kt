package app.pointlastseen.family.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FamilyAnswerTest {
    private val server = Any()

    /** The one update a family member makes to a question: exactly these three fields, nothing else. */
    @Test fun anAnswerAddsExactlyTheThreeRuledFields() {
        assertEquals(
            mapOf("answer" to "She likes the old mill.", "answeredByUid" to "uid-1", "answeredAt" to server),
            FamilyAnswer.update("  She likes the old mill. ", "uid-1", server),
        )
    }

    @Test fun anEmptyOrTooLongAnswerIsNotSent() {
        assertNull(FamilyAnswer.update("   ", "uid-1", server))
        assertNull(FamilyAnswer.update("a".repeat(501), "uid-1", server))
        assertEquals("a".repeat(500), FamilyAnswer.update("a".repeat(500), "uid-1", server)!!["answer"])
    }
}
