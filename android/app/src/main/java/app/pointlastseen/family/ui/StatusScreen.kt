package app.pointlastseen.family.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/**
 * The status card: one sentence, a quiet grey ring, and what the family can send.
 * Writes the server refused stay visible with Try again. Once the person is found
 * or the search is closed there is nothing left to send. A family may leave a search
 * still open after confirming it (a wrong code, the wrong search).
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
    onLeave: () -> Unit,
    shareFailed: Boolean = false,
    /** The name the person answers to, for the fixed news line. */
    subjectName: String = "",
    /** Leaving a search still open, after the family confirms it. */
    onLeaveOpen: () -> Unit = {},
) {
    val ring = MaterialTheme.colorScheme.outline
    val open = status != "found" && status != "closed"
    var asking by rememberSaveable { mutableStateOf(false) }
    FamilyScaffold(mode, killCloud) {
        Canvas(Modifier.size(56.dp).clearAndSetSemantics { }) {
            drawCircle(ring, radius = size.minDimension / 2 - 4.dp.toPx(), style = Stroke(width = 3.dp.toPx()))
        }
        Sentence(Copy.status(status))
        Note(Copy.newsByPhone(subjectName))
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
        OtherAction("Edit profile") { onOpen(Screen.PROFILE) }
        OtherAction("About this phone") { onOpen(Screen.ABOUT) }
        when {
            !open -> OtherAction("Leave this search", onClick = onLeave)
            asking -> {
                Note(Copy.LEAVE_CONFIRM)
                MainAction("Leave") { asking = false; onLeaveOpen() }
                OtherAction("Stay") { asking = false }
            }
            else -> OtherAction("Leave this search") { asking = true }
        }
    }
}
