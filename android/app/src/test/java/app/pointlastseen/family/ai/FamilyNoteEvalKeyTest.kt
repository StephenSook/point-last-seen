package app.pointlastseen.family.ai

import app.pointlastseen.family.core.EvidenceScreen
import app.pointlastseen.family.core.LanguageScreen
import app.pointlastseen.family.core.PhoneNumbers
import app.pointlastseen.family.data.Hashes
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The family-note answer key the on-device eval reads (`NoteEvalLiveTest`). It is frozen: its SHA-256 is pinned
 * here, so a run always names the exact key it scored against, and a changed key needs a new name. Every note must
 * reach the model: none trips the evidence pre-screen, each looks English, and phone-number removal leaves it as is.
 */
class FamilyNoteEvalKeyTest {
    private val root = File(System.getProperty("pls.repoRoot") ?: error("pls.repoRoot is not set by Gradle"))
    private val keyFile = File(root, "android/app/src/androidTest/assets/eval/pls-family-notes-v1.json")
    private val rows = Json.parseToJsonElement(keyFile.readText()).jsonObject.getValue("rows").jsonArray.map { it.jsonObject }

    @Test fun theKeyIsFrozen() {
        assertEquals("ab23c46d74c79b2d854b10c8ecc135c275cac2b3f9ac279b8da838f289449569", Hashes.sha256Hex(keyFile.readBytes()))
    }

    @Test fun sixtyRowsFifteenOfEachKindWithUniqueIds() {
        assertEquals(60, rows.size)
        assertEquals(60, rows.map { it.getValue("id").jsonPrimitive.content }.toSet().size)
        val kinds = rows.groupingBy { it.getValue("kind").jsonPrimitive.content }.eachCount()
        assertEquals(FamilyNoteReading.KINDS.associateWith { 15 }, kinds)
    }

    private val evidence = EvidenceScreen(EvidenceScreen.parseTerms(File(root, "shared/constants/evidence-terms.json").readText()))
    private val language = LanguageScreen.parse(File(root, "shared/constants/language-words.json").readText())

    private fun stopped(notes: List<String>) = notes.filter { note ->
        evidence.isPossibleEvidence(note) || !language.looksEnglish(note) || PhoneNumbers.remove(note) != note ||
            note.length > FamilyNote.MAX_NOTE
    }

    @Test fun everyNoteReachesTheModel() {
        val stopped = stopped(rows.map { it.getValue("note").jsonPrimitive.content })
        assertTrue("these notes would not reach the model: $stopped", stopped.isEmpty())
    }

    @Test fun theReachCheckCatchesNotesTheAppWouldStop() {
        val planted = listOf(
            "He carries a knife in his jacket pocket",
            "Она любит гулять к старой мельнице у ручья",
            "Call her daughter at 404 555 0187 if you see her",
        )
        assertEquals(planted, stopped(planted))
    }
}
