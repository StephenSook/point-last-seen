package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable

/**
 * First screen after "She's gone": the first-minutes guidance (look nearby now, call 911 within
 * five minutes) with its source. In a joined drill or judge incident the drill line leads and the
 * dialer is shown but disabled: the drill call-taker is a person in the room. Before joining the
 * mode is unknown, so one line tells a drill family what to do instead. With the 911 script flag
 * on, "What to say" opens the script built from the profile.
 */
@Composable
fun CallFirstScreen(mode: String?, killCloud: Boolean, onDial: () -> Unit, onDone: () -> Unit, onScript: (() -> Unit)? = null) {
    val drill = Copy.drillBanner(mode) != null
    FamilyScaffold(mode, killCloud) {
        Sentence(Copy.callFirst(mode))
        if (drill) Note(Copy.FIRST_MINUTES)
        Note(Copy.FIRST_MINUTES_SOURCE)
        if (!drill) Note(Copy.UNJOINED_DRILL_HINT)
        if (drill) OtherAction("Call 911", enabled = false, onClick = {}) else MainAction("Call 911", onClick = onDial)
        if (onScript != null) OtherAction("What to say", onClick = onScript)
        if (drill) MainAction("I called", onClick = onDone) else OtherAction("I called", onClick = onDone)
    }
}
