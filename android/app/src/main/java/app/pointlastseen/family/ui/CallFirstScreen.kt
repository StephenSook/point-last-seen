package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable

/**
 * First screen after "She's gone". In a joined drill there is no dialer: the drill
 * call-taker is a person in the room. Before joining the mode is unknown, so "Call 911
 * first." stays the headline and one line tells a drill family what to do instead.
 * With the 911 script flag on, "What to say" opens the script built from the profile.
 */
@Composable
fun CallFirstScreen(mode: String?, killCloud: Boolean, onDial: () -> Unit, onDone: () -> Unit, onScript: (() -> Unit)? = null) {
    val drill = Copy.drillBanner(mode) != null
    FamilyScaffold(mode, killCloud) {
        Sentence(Copy.callFirst(mode))
        if (!drill) Note(Copy.UNJOINED_DRILL_HINT)
        if (!drill) MainAction("Call 911", onClick = onDial)
        if (onScript != null) OtherAction("What to say", onClick = onScript)
        if (drill) MainAction("I called", onClick = onDone) else OtherAction("I called", onClick = onDone)
    }
}
