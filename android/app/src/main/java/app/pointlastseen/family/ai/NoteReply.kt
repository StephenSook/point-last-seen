package app.pointlastseen.family.ai

import com.google.firebase.ai.annotations.Generable
import com.google.firebase.ai.type.GenerateObjectResponse
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The note kinds as the model must write them. The constants are named as the wire
 * strings because the Firebase AI KSP processor puts constant names (not @SerialName)
 * into the schema.
 */
@Suppress("EnumEntryName")
@Serializable
enum class NoteKind { place, address, wandering, clothing }

/**
 * The family note read's reply. The note runs PREFER_ON_DEVICE, where Firebase AI Logic
 * structured output needs a @Generable data class through generateObject (manual schemas
 * are cloud-only). Every instruction stays in the prompt; FamilyNote.parse checks every field.
 */
@Serializable
@Generable(description = "A family note sorted into one kind")
data class NoteReply(val kind: NoteKind, val label: String, val summary: String, val evidenceQuote: String) {
    companion object
}

/** The reply as JSON text for FamilyNote.parse: the response text, else the decoded object re-encoded. */
fun noteReplyText(r: GenerateObjectResponse<NoteReply>): String? =
    r.response.text ?: runCatching { r.getObject() }.getOrNull()?.let { Json.encodeToString(NoteReply.serializer(), it) }
