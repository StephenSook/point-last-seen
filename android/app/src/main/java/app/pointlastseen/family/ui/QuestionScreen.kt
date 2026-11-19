package app.pointlastseen.family.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.pointlastseen.family.data.FamilyAnswer

/** The search lead's question, read from the server; [answer] is set once it has been answered. */
data class QuestionUi(
    val loading: Boolean = false,
    val text: String? = null,
    val answer: String? = null,
    val sending: Boolean = false,
    val error: String? = null,
)

/** The search lead asks one question; the family answers it once. */
@Composable
fun QuestionScreen(mode: String?, killCloud: Boolean, ui: QuestionUi, onSend: (String) -> Unit, onBack: () -> Unit) {
    var draft by rememberSaveable(ui.text) { mutableStateOf("") }
    FamilyScaffold(mode, killCloud) {
        when {
            ui.loading -> Sentence("Getting the question.")
            ui.text == null -> Sentence(ui.error ?: "The question could not be found.")
            else -> {
                Note("The search lead asks:")
                Sentence(ui.text)
                if (ui.answer != null) {
                    Note("Your answer was sent:")
                    Note(ui.answer)
                } else {
                    OutlinedTextField(
                        value = draft, onValueChange = { draft = it.take(FamilyAnswer.MAX) },
                        label = { Text("Your answer") }, modifier = Modifier.fillMaxWidth(), enabled = !ui.sending,
                    )
                    ui.error?.let { Note(it) }
                    MainAction("Send answer", enabled = draft.isNotBlank() && !ui.sending) { onSend(draft) }
                }
            }
        }
        OtherAction("Back", enabled = !ui.sending, onClick = onBack)
    }
}
