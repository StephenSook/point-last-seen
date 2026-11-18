package app.pointlastseen.family.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.core.Compass

/** What the family confirms before a clip leaves the phone. */
data class ClipForm(
    val personInClip: Boolean,
    val footageOwner: Boolean,
    val cloudProcessing: Boolean,
    val publicUse: Boolean,
    val clockConfirmed: Boolean,
    val startMinuteOfDay: Int,
    val facingDeg: Int?,
)

/** The last-seen card: three facts and the key frame. */
data class ClipCard(
    val lastSeen: String,
    val direction: String?,
    val clothing: String,
    val route: String,
    val cached: Boolean,
    val frameTime: String,
    val frame: ImageBitmap? = null,
    val box: List<Int>? = null,
)

sealed class ClipUi {
    data object Idle : ClipUi()
    data object Busy : ClipUi()
    data class Read(val card: ClipCard) : ClipUi()
    data class Done(val outcome: ClipOutcome) : ClipUi()
}

private val HHMM = Regex("""^([01]?\d|2[0-3]):([0-5]\d)$""")

@Composable
private fun Tick(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}

/** Share a staged camera clip: four separate consents, the camera's clock and facing, a cloud read, a card to confirm. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClipScreen(
    mode: String?,
    killCloud: Boolean,
    clipLabel: String?,
    ui: ClipUi,
    onPick: () -> Unit,
    onRead: (ClipForm) -> Unit,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
) {
    FamilyScaffold(mode, killCloud) {
        when (ui) {
            ClipUi.Idle, ClipUi.Busy -> {
                var person by rememberSaveable { mutableStateOf(false) }
                var owner by rememberSaveable { mutableStateOf(false) }
                var cloud by rememberSaveable { mutableStateOf(false) }
                var public by rememberSaveable { mutableStateOf(false) }
                var clock by rememberSaveable { mutableStateOf(false) }
                var start by rememberSaveable { mutableStateOf("") }
                var facing by rememberSaveable { mutableStateOf<Int?>(null) }
                Sentence("Share a camera clip.")
                if (clipLabel == null) {
                    MainAction("Choose a clip", onClick = onPick)
                } else {
                    Note("Clip: $clipLabel")
                    OtherAction("Choose another clip", enabled = ui == ClipUi.Idle, onClick = onPick)
                }
                Tick("The person in the clip agrees", person) { person = it }
                Tick("I own this footage or have the owner's OK", owner) { owner = it }
                Tick("Send it to the cloud to read it", cloud) { cloud = it }
                Tick("It may be shown in the drill film (optional)", public) { public = it }
                OutlinedTextField(start, { start = it.take(5) }, label = { Text("When the clip starts (HH:MM)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Tick("The camera's clock is right", clock) { clock = it }
                Note("Which way does the camera face?")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Compass.FACINGS.forEach { (word, deg) -> FilterChip(selected = facing == deg, onClick = { facing = deg }, label = { Text(word) }) }
                    FilterChip(selected = facing == null, onClick = { facing = null }, label = { Text("I don't know") })
                }
                val m = HHMM.matchEntire(start.trim())
                MainAction("Read the clip", enabled = ui == ClipUi.Idle && clipLabel != null && person && owner && cloud && clock && m != null) {
                    val match = m ?: return@MainAction
                    onRead(ClipForm(person, owner, cloud, public, clock, match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt(), facing))
                }
            }
            is ClipUi.Read -> {
                val c = ui.card
                var showFrame by rememberSaveable { mutableStateOf(false) }
                Sentence("Last seen ${c.lastSeen}")
                Note(if (c.direction != null) "Walking ${c.direction}" else "Direction not known")
                Note("Wearing ${c.clothing}")
                Note(c.route)
                if (c.cached) Note("Read before. No new cloud call.")
                AssistChip(onClick = { showFrame = !showFrame }, label = { Text("See the frame") })
                if (showFrame) {
                    Note("Frame at ${c.frameTime}")
                    c.frame?.let { FrameWithBox(it, c.box) }
                }
                MainAction("Confirm", onClick = onConfirm)
            }
            is ClipUi.Done -> when (val o = ui.outcome) {
                is ClipOutcome.Refused -> Sentence(o.message)
                ClipOutcome.CouldNotRead -> Sentence("Couldn't read")
                ClipOutcome.Failed -> Sentence("Could not reach the cloud. Try again.")
                is ClipOutcome.Read -> Sentence("Read.")
            }
        }
        OtherAction("Back", enabled = ui != ClipUi.Busy, onClick = onBack)
    }
}

/** The key frame with the model's box ([yMin, xMin, yMax, xMax] on 0 to 1000) drawn over it. */
@Composable
private fun FrameWithBox(frame: ImageBitmap, box: List<Int>?) {
    Image(
        bitmap = frame,
        contentDescription = "Key frame from the clip",
        modifier = Modifier.fillMaxWidth().drawWithContent {
            drawContent()
            if (box != null && box.size == 4) {
                val (y0, x0, y1, x1) = box.map { it / 1000f }
                drawRect(
                    color = Color(0xFFFFB020),
                    topLeft = Offset(x0 * size.width, y0 * size.height),
                    size = Size((x1 - x0) * size.width, (y1 - y0) * size.height),
                    style = Stroke(width = 3.dp.toPx()),
                )
            }
        },
    )
}
