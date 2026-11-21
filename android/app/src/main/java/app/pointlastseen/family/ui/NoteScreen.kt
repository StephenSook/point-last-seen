package app.pointlastseen.family.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.ai.NoteOutcome

sealed class NoteUi {
    data object Idle : NoteUi()
    data object Busy : NoteUi()
    data class Done(val outcome: NoteOutcome, val text: String) : NoteUi()
}

private val KIND_LABEL = mapOf(
    "place" to "a place they like to go",
    "address" to "a place they used to live",
    "wandering" to "where they were found before",
    "clothing" to "what they wear",
)
private val KIND_CHIP = listOf(
    "place" to "A place they like to go",
    "address" to "A place they used to live",
    "wandering" to "Where they were found before",
    "clothing" to "Clothing",
)

/** "I remembered something": the note is sorted by the SDK's hybrid mode, shown as a suggestion, and kept only if the family adds it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NoteScreen(
    mode: String?,
    killCloud: Boolean,
    ui: NoteUi,
    onSort: (text: String, cloudConsent: Boolean) -> Unit,
    onAdd: (FamilyNoteReading) -> Unit,
    onBack: () -> Unit,
    model: ModelState = ModelState(DeviceModelStatus.UNAVAILABLE),
    onGetModel: () -> Unit = {},
) {
    FamilyScaffold(mode, killCloud) {
        when (ui) {
            NoteUi.Idle, NoteUi.Busy -> {
                var text by rememberSaveable { mutableStateOf("") }
                // The field opens focused, so the keyboard and its microphone key are one tap from
                // dictation. The keyboard does the voice typing; the app calls no speech API.
                val focus = remember { FocusRequester() }
                LaunchedEffect(Unit) { focus.requestFocus() }
                Sentence("I remembered something.")
                OutlinedTextField(
                    text, { text = it.take(FamilyNote.MAX_NOTE) }, label = { Text("What did you remember?") },
                    minLines = 3, modifier = Modifier.fillMaxWidth().focusRequester(focus),
                )
                MainAction("Sort it", enabled = ui == NoteUi.Idle && text.isNotBlank()) { onSort(text.trim(), false) }
                // After the family's job: the model is ready, downloading, or offered (with its button); nothing for a
                // phone without a model.
                when (model.status) {
                    DeviceModelStatus.AVAILABLE, DeviceModelStatus.DOWNLOADING -> Note(Copy.model(model))
                    DeviceModelStatus.DOWNLOADABLE -> {
                        Note(Copy.model(model))
                        OtherAction(Copy.GET_MODEL, onClick = onGetModel)
                    }
                    else -> Unit
                }
                // Whatever the status says after it (unknown, say), a failed download is shown.
                if (model.downloadFailed) Note(Copy.MODEL_FAILED)
            }
            is NoteUi.Done -> when (val o = ui.outcome) {
                NoteOutcome.NeedsConsent -> {
                    if (model.status == DeviceModelStatus.AVAILABLE) {
                        // The model arrived while the question was open: the same note now sorts here, no cloud needed.
                        Sentence(Copy.model(model))
                        MainAction("Sort it on this phone") { onSort(ui.text, false) }
                    } else {
                        // The question is the title; the model's state is one quiet line under it.
                        Sentence("Send this note to the cloud to sort it?")
                        Note(Copy.model(model))
                        MainAction("Send to the cloud") { onSort(ui.text, true) }
                        if (model.downloadFailed) Note(Copy.MODEL_FAILED)
                        if (model.status == DeviceModelStatus.DOWNLOADABLE) OtherAction(Copy.GET_MODEL, onClick = onGetModel)
                    }
                    Note("Or sort it yourself, on this phone:")
                    ManualKind(ui.text, onAdd)
                }
                NoteOutcome.PossibleEvidence -> Sentence(Copy.EVIDENCE)
                NoteOutcome.NotEnglish -> {
                    Sentence(Copy.NOT_ENGLISH)
                    ManualKind(ui.text, onAdd)
                }
                is NoteOutcome.Read -> {
                    var label by remember(o) { mutableStateOf(o.reading.label) }
                    Sentence("Suggested: ${KIND_LABEL[o.reading.kind] ?: o.reading.kind}")
                    Note(Copy.readWhere(o.route, o.modelStatus))
                    OutlinedTextField(label, { label = it.take(FamilyNote.MAX_LABEL) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    MainAction("Add to profile", enabled = label.isNotBlank()) { onAdd(o.reading.copy(label = label.trim())) }
                }
                NoteOutcome.FillByHand, NoteOutcome.Invalid, NoteOutcome.Failed -> {
                    Sentence("It could not be sorted. Pick what it is.")
                    ManualKind(ui.text, onAdd)
                }
            }
        }
        OtherAction("Back", enabled = ui != NoteUi.Busy, onClick = onBack)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ManualKind(text: String, onAdd: (FamilyNoteReading) -> Unit) {
    var kind by remember { mutableStateOf<String?>(null) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        KIND_CHIP.forEach { (k, label) -> FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text(label) }) }
    }
    MainAction("Add to profile", enabled = kind != null) {
        onAdd(FamilyNoteReading(kind ?: return@MainAction, text.trim().take(FamilyNote.MAX_LABEL), "", ""))
    }
}
