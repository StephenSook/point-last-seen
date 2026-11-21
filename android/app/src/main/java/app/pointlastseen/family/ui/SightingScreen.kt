package app.pointlastseen.family.ui

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pointlastseen.family.core.Colors
import app.pointlastseen.family.data.FamilySightingInput

private val AGO = listOf("Just now" to 0, "15 min ago" to 15, "30 min ago" to 30, "1 hour ago" to 60, "2 hours ago" to 120)
private val WAYS = listOf("North" to "n", "East" to "e", "South" to "s", "West" to "w", "Not sure" to "unknown")
private val TOP = Colors.ALL.filter { it != "unknown" }

/** "Someone saw them": when, where, which way, what they wore. No field for a caller's name or number. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SightingScreen(
    mode: String?,
    killCloud: Boolean,
    busy: Boolean,
    error: String?,
    nowMs: () -> Long,
    onSend: (FamilySightingInput) -> Unit,
    onBack: () -> Unit,
) {
    var ago by rememberSaveable { mutableStateOf<Int?>(null) }
    var place by rememberSaveable { mutableStateOf("") }
    var way by rememberSaveable { mutableStateOf("unknown") }
    var top by rememberSaveable { mutableStateOf("unknown") }
    var bottom by rememberSaveable { mutableStateOf("unknown") }
    var note by rememberSaveable { mutableStateOf("") }

    FamilyScaffold(mode, killCloud) {
        Sentence("Someone saw them.")
        Note("When?")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AGO.forEach { (label, min) -> FilterChip(selected = ago == min, onClick = { ago = min }, label = { Text(label) }) }
        }
        OutlinedTextField(place, { place = it.take(200) }, label = { Text("Where") }, modifier = Modifier.fillMaxWidth())
        Note("Which way were they going?")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WAYS.forEach { (label, v) -> FilterChip(selected = way == v, onClick = { way = v }, label = { Text(label) }) }
        }
        Note("What were they wearing?")
        // Each chip shows the colour's name under its Top or Bottom label; TalkBack hears "Top: blue".
        Note("Top")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TOP.forEach { c ->
                FilterChip(selected = top == c, onClick = { top = if (top == c) "unknown" else c }, label = { Text(c) },
                    modifier = Modifier.semantics { contentDescription = "Top: $c" })
            }
        }
        Note("Bottom")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TOP.forEach { c ->
                FilterChip(selected = bottom == c, onClick = { bottom = if (bottom == c) "unknown" else c }, label = { Text(c) },
                    modifier = Modifier.semantics { contentDescription = "Bottom: $c" })
            }
        }
        OutlinedTextField(
            note, { note = it.take(2000) }, label = { Text("What they said") },
            supportingText = { Text("Do not type the caller's name.") }, minLines = 3, modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Note(it) }
        MainAction("Send to command", enabled = !busy && ago != null && place.isNotBlank()) {
            val minutes = ago ?: return@MainAction
            onSend(
                FamilySightingInput(
                    observedAtMs = nowMs() - minutes * 60_000L, position = null, place = place.trim(),
                    direction = way, topColor = top, bottomColor = bottom, footwear = "", carried = "", note = note.trim(),
                ),
            )
        }
        OtherAction("Back", enabled = !busy, onClick = onBack)
    }
}
