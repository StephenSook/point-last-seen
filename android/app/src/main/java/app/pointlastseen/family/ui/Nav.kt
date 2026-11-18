package app.pointlastseen.family.ui

enum class Screen { PROFILE, CALL_FIRST, JOIN, STATUS, CLIP, PHOTOS, NOTE, SIGHTING, ABOUT, SCRIPT_911 }

data class NavState(val screen: Screen, val gone: Boolean, val joined: Boolean)

/** A step's new state, and whether the profile documents should be written now. */
data class NavStep(val state: NavState, val publishProfile: Boolean = false)

/**
 * The family app's flow (spec 6.4): the profile is the home screen until someone is
 * missing; "She's gone" always shows "Call 911 first" next; the shared profile is
 * written once the family has both said she is gone and joined the incident.
 */
object Nav {
    private val ACTIONS = setOf(Screen.CLIP, Screen.PHOTOS, Screen.NOTE, Screen.SIGHTING)

    fun start(joined: Boolean, gone: Boolean) =
        NavState(if (joined && gone) Screen.STATUS else Screen.PROFILE, gone, joined)

    /** A family already joined publishes right away; the call-first screen is not a gate on sharing. */
    fun shesGone(s: NavState) = NavStep(s.copy(screen = Screen.CALL_FIRST, gone = true), publishProfile = s.joined)

    fun calledFirst(s: NavState) =
        if (s.joined) NavStep(s.copy(screen = Screen.STATUS), publishProfile = true) else NavStep(s.copy(screen = Screen.JOIN))

    fun toJoin(s: NavState) = NavStep(s.copy(screen = Screen.JOIN))

    fun joined(s: NavState) =
        if (s.gone) NavStep(s.copy(screen = Screen.STATUS, joined = true), publishProfile = true)
        else NavStep(s.copy(screen = Screen.PROFILE, joined = true))

    fun open(s: NavState, target: Screen): NavState =
        if (target in ACTIONS && !(s.joined && s.gone)) s else s.copy(screen = target)

    /** The 911 script is read during the call, so Back returns to "Call 911 first". */
    fun back(s: NavState): NavState = s.copy(
        screen = when {
            s.screen == Screen.SCRIPT_911 -> Screen.CALL_FIRST
            s.joined && s.gone -> Screen.STATUS
            else -> Screen.PROFILE
        },
    )

    /**
     * The system back gesture: one step toward the home screen (the status card once
     * gone and joined, else the profile). Null on the home screen, where the system
     * closes the app. On "Call 911 first" it stays put so the step is not skipped.
     */
    fun systemBack(s: NavState): NavState? {
        val home = if (s.joined && s.gone) Screen.STATUS else Screen.PROFILE
        return when (s.screen) {
            home -> null
            Screen.CALL_FIRST -> s
            else -> back(s)
        }
    }

    /** Leaving a search: this install is free for the next drill or incident; the profile stays. */
    fun leave(@Suppress("UNUSED_PARAMETER") s: NavState): NavState = NavState(Screen.PROFILE, gone = false, joined = false)
}
