package app.pointlastseen.family.ai

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The family note runs PREFER_ON_DEVICE through firebase-ai-ondevice, which uses the
 * ML Kit GenAI Prompt API. Its input must be "under 4000 tokens, or approximately 3000
 * English words" (developers.google.com/ml-kit/genai/prompt/android/get-started).
 * A token covers at least one UTF-8 byte, so a request under 4000 bytes is under the cap
 * whatever the tokenizer does. Non-English notes can be more bytes per character and are
 * not covered by this bound.
 */
class OnDeviceBudgetTest {
    private val cap = 4000
    // The note schema (four fields, one a four-value enum) written out as Gemini schema JSON
    // with every field required is 265 bytes; 600 leaves room for how the SDK frames it.
    private val schemaAllowance = 600

    private fun requestBytes(noteChars: Int) =
        FamilyNote.prompt("x".repeat(noteChars)).toByteArray(Charsets.UTF_8).size + schemaAllowance

    @Test fun theLongestEnglishNoteFitsTheOnDeviceCapEvenAtOneTokenPerByte() {
        assertTrue("${requestBytes(FamilyNote.MAX_NOTE)} bytes", requestBytes(FamilyNote.MAX_NOTE) < cap)
    }

    @Test fun theBoundCanFailANoteTwiceTheCap() {
        assertFalse(requestBytes(FamilyNote.MAX_NOTE * 2) < cap)
    }
}
