package app.pointlastseen.family.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/** The status card: one sentence, a quiet grey ring, and what the family can send. */
@Composable
fun StatusScreen(status: String?, mode: String?, killCloud: Boolean, pending: Int, onOpen: (Screen) -> Unit) {
    val ring = MaterialTheme.colorScheme.outline
    FamilyScaffold(mode, killCloud) {
        Canvas(Modifier.size(56.dp).clearAndSetSemantics { }) {
            drawCircle(ring, radius = size.minDimension / 2 - 4.dp.toPx(), style = Stroke(width = 3.dp.toPx()))
        }
        Sentence(Copy.status(status))
        if (pending > 0) Note(if (pending == 1) "1 item waiting to send." else "$pending items waiting to send.")
        OtherAction("Share a camera clip") { onOpen(Screen.CLIP) }
        OtherAction("Add recent photos") { onOpen(Screen.PHOTOS) }
        OtherAction("I remembered something") { onOpen(Screen.NOTE) }
        OtherAction("Someone saw them") { onOpen(Screen.SIGHTING) }
        OtherAction("About this phone") { onOpen(Screen.ABOUT) }
    }
}
