package app.pointlastseen.family.ai

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * The note read runs PREFER_ON_DEVICE, where structured output needs a @Generable data
 * class (generateObject); manual schemas are cloud-only. The generated schema must carry
 * the wire values the parser accepts.
 */
class NoteReplyTest {
    private val schema = NoteReply.firebaseAISchema()

    @Test fun theSchemaFieldsAreTheParserFields() {
        assertEquals(setOf("kind", "label", "summary", "evidenceQuote"), schema.properties!!.keys)
    }

    @Test fun theSchemaKindsAreTheWireKinds() {
        assertEquals(FamilyNoteReading.KINDS, schema.properties!!.getValue("kind").enum)
    }

    @Test fun aDecodedReplyPassesTheParser() {
        val reply = NoteReply("place", "The old mill", "They like the mill.", "old mill")
        val read = FamilyNote.parse(Json.encodeToString(NoteReply.serializer(), reply), "she talks about the old mill")
        assertNotNull(read)
        assertEquals("place", read!!.kind)
    }
}
