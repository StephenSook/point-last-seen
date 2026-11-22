package app.pointlastseen.family.data

import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.core.PhoneNumbers
import app.pointlastseen.family.shared.SharedFiles
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Text this app has scrubbed and shows comes back unchanged through the paths that scrub it again on save: the profile
 * form (its address, place and past-wandering fields are filled from the saved labels) and a remembered note's label.
 * Every note of the shared phone corpus that fits one label (one line, no ";") is scrubbed and then saved each way.
 */
class SavedTextIsScrubbedOnceTest {
    private val shown = SharedFiles.json("shared/test-vectors/phone-numbers-corpus.json")["rows"]!!.jsonArray
        .map { PhoneNumbers.remove(it.jsonObject["input"]!!.jsonPrimitive.content) }
        .filter { it.isNotBlank() && it == it.trim() && '\n' !in it && '\r' !in it && ';' !in it }

    private fun changed(save: (String) -> String): List<String> = shown.filter { save(it) != it }

    private fun report(path: String, differ: List<String>) =
        assertEquals("$path changes ${differ.size} of ${shown.size} shown labels:\n${differ.take(5).joinToString("\n") { "$it -> saved differently" }}", 0, differ.size)

    @Test fun enoughLabelsAreChecked() = assertTrue("labels: ${shown.size}", shown.size >= 3_000)

    @Test fun theProfileFormSavesAShownPlaceOrAddressUnchanged() =
        report("placeEntries", changed { Profiles.placeEntries(it, listOf(PlaceEntry(it, null))).single().label })

    @Test fun theProfileFormSavesAShownWanderingSpotUnchanged() =
        report("wanderingEntries", changed { Profiles.wanderingEntries(it, listOf(WanderingEntry(it, null))).single().foundWhere })

    @Test fun aRememberedNoteSavesItsShownLabelUnchanged() {
        report("applyNote place", changed { Profiles.applyNote(SubjectProfile(), FamilyNoteReading("place", it, "s", "q")).placesFrequented.single().label })
        report("applyNote clothing", changed { Profiles.applyNote(SubjectProfile(), FamilyNoteReading("clothing", it, "s", "q")).clothingLastWorn })
    }
}
