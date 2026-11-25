package app.pointlastseen.family.ai

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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

    private val note = "she talks about the old mill"
    private val reply = NoteReply("place", "The old mill", "They like the mill.", "old mill")

    /** On the phone the SDK returns the reply as a typed object and the response text is empty. */
    @Test fun anOnDeviceReplyWithEmptyTextIsReadFromTheTypedObject() {
        val read = FamilyNote.parse(noteReplyJson("") { reply }, note)
        assertNotNull("the typed reply was not used when the text was empty", read)
        assertEquals("place", read!!.kind)
        assertEquals("old mill", read.evidenceQuote)
    }

    @Test fun theTypedObjectIsUsedEvenWhenTextIsPresent() {
        val read = FamilyNote.parse(noteReplyJson("not json") { reply }, note)
        assertNotNull(read)
    }

    /** In the cloud the object is decoded from the text, so both give the same reading. */
    @Test fun aCloudReplyReadsTheSameAsTextOrAsObject() {
        val text = Json.encodeToString(NoteReply.serializer(), reply)
        assertEquals(FamilyNote.parse(text, note), FamilyNote.parse(noteReplyJson(text) { reply }, note))
    }

    @Test fun whenTheObjectCannotBeReadTheTextIsUsedAndBlankTextGivesNothing() {
        val text = Json.encodeToString(NoteReply.serializer(), reply)
        assertNotNull(FamilyNote.parse(noteReplyJson(text) { error("no object") }, note))
        assertNull(noteReplyJson("  ") { error("no object") })
        assertNull(noteReplyJson(null) { null })
    }
}
