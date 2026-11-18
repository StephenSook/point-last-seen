package app.pointlastseen.family.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/**
 * The status card: one sentence, a quiet grey ring, and what the family can send.
 * Writes the server refused stay visible with Try again. Once the person is found
 * or the search is closed there is nothing left to send.
 */
@Composable
fun StatusScreen(
    status: String?,
    mode: String?,
    killCloud: Boolean,
    pending: Int,
    rejected: Int,
    onOpen: (Screen) -> Unit,
    onRetry: () -> Unit,
    shareFailed: Boolean = false,
) {
    val ring = MaterialTheme.colorScheme.outline
    val open = status != "found" && status != "closed"
    FamilyScaffold(mode, killCloud) {
        Canvas(Modifier.size(56.dp).clearAndSetSemantics { }) {
            drawCircle(ring, radius = size.minDimension / 2 - 4.dp.toPx(), style = Stroke(width = 3.dp.toPx()))
        }
        Sentence(Copy.status(status))
        if (shareFailed) Note("The profile did not reach command. It will be sent again when you save it.")
        if (pending > 0) Note(if (pending == 1) "1 item waiting to send." else "$pending items waiting to send.")
        if (rejected > 0) {
            Note(if (rejected == 1) "1 item was not accepted." else "$rejected items were not accepted.")
            OtherAction("Try again", onClick = onRetry)
        }
        if (open) {
            OtherAction("Share a camera clip") { onOpen(Screen.CLIP) }
            OtherAction("Add recent photos") { onOpen(Screen.PHOTOS) }
            OtherAction("I remembered something") { onOpen(Screen.NOTE) }
            OtherAction("Someone saw them") { onOpen(Screen.SIGHTING) }
        }
        OtherAction("About this phone") { onOpen(Screen.ABOUT) }
    }
}
