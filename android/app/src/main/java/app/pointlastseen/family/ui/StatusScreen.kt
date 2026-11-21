package app.pointlastseen.family.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The status card: one sentence, then what the family can send, a sighting first; the profile, About and
 * leaving follow, quieter. Writes the server refused stay visible with Try again. Once the person is found
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
    /** The family's last profile save failed on this phone, so its changes were not sent. */
    unsaved: Boolean = false,
    /** The name the person answers to, for the fixed news line. */
    subjectName: String = "",
    /** Leaving a search still open, after the family confirms it. */
    onLeaveOpen: () -> Unit = {},
    /** Why command ended the search (found, suspended or training_ended), when it is closed. */
    closedReason: String? = null,
) {
    val open = status != "found" && status != "closed"
    var asking by rememberSaveable { mutableStateOf(false) }
    FamilyScaffold(mode, killCloud) {
        Sentence(Copy.status(status, closedReason))
        Note(Copy.newsByPhone(subjectName))
        if (unsaved) Note("Your last profile changes did not save on this phone, so they were not sent. Open the profile and save again.")
        if (shareFailed) Note("The profile did not reach command. It will be sent again when you save it.")
        if (pending > 0) Note(if (pending == 1) "1 item waiting to send." else "$pending items waiting to send.")
        if (rejected > 0) {
            Note(if (rejected == 1) "1 item was not accepted." else "$rejected items were not accepted.")
            OtherAction("Try again", onClick = onRetry)
        }
        if (open) {
            OtherAction("Someone saw them") { onOpen(Screen.SIGHTING) }
            OtherAction("I remembered something") { onOpen(Screen.NOTE) }
            OtherAction("Share a camera clip") { onOpen(Screen.CLIP) }
            OtherAction("Add recent photos") { onOpen(Screen.PHOTOS) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuietAction("Edit profile") { onOpen(Screen.PROFILE) }
            QuietAction("About this phone") { onOpen(Screen.ABOUT) }
        }
        when {
            // Found or closed: leaving is the one thing left to do, so it stays a full button.
            !open -> OtherAction("Leave this search", onClick = onLeave)
            asking -> {
                Note(Copy.LEAVE_CONFIRM)
                MainAction("Leave") { asking = false; onLeaveOpen() }
                OtherAction("Stay") { asking = false }
            }
            else -> QuietAction("Leave this search") { asking = true }
        }
    }
}
