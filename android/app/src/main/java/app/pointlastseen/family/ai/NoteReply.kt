package app.pointlastseen.family.ai

import com.google.firebase.ai.annotations.Generable
import com.google.firebase.ai.annotations.Guide
import com.google.firebase.ai.type.GenerateObjectResponse
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The family note read's reply. The note runs PREFER_ON_DEVICE, where Firebase AI Logic
 * structured output needs a @Generable data class through generateObject (manual schemas
 * are cloud-only). Every instruction stays in the prompt; FamilyNote.parse checks every field.
 *
 * [kind] is a String limited to the wire kinds (FamilyNoteReading.KINDS) by @Guide, not an
 * enum: on a phone, ML Kit reads only basic types and registered @Generable types, and it
 * refused the request outright when kind was an enum class. The cloud schema keeps the same
 * four values.
 */
@Serializable
@Generable(description = "A family note sorted into one kind")
data class NoteReply(
    @Guide(enumValues = ["place", "address", "wandering", "clothing"]) val kind: String,
    val label: String,
    val summary: String,
    val evidenceQuote: String,
) {
    companion object
}

/** The reply as JSON text for FamilyNote.parse, which checks every field. */
fun noteReplyText(r: GenerateObjectResponse<NoteReply>): String? = noteReplyJson(r.response.text) { r.getObject() }

/**
 * The typed reply re-encoded, else non-blank [text]. On the phone the SDK hands back the reply only as a typed
 * object and the response text is empty; in the cloud the object is decoded from the text. So the typed reply is
 * read first on both paths, and the text is the fallback when it cannot be decoded.
 */
fun noteReplyJson(text: String?, typed: () -> NoteReply?): String? =
    runCatching(typed).getOrNull()?.let { Json.encodeToString(NoteReply.serializer(), it) } ?: text?.takeIf { it.isNotBlank() }
