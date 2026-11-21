package app.pointlastseen.family.ui

enum class Screen { PROFILE, CALL_FIRST, JOIN, STATUS, CLIP, PHOTOS, NOTE, SIGHTING, ABOUT, SCRIPT_911, QUESTION }

data class NavState(val screen: Screen, val gone: Boolean, val joined: Boolean)

/** A step's new state, and whether the profile documents should be written now. */
data class NavStep(val state: NavState, val publishProfile: Boolean = false)

/**
 * The family app's flow (spec 6.4): the profile is the home screen until someone is
 * missing; "She's gone" always shows "Call 911 first" next; the shared profile is
 * written once the family has both said she is gone and joined the incident.
 */
object Nav {
    // A note is not among them: writing down what the family remembers is preparation, and it sorts into the
    // profile on this phone, so it opens before a search is joined too.
    private val ACTIONS = setOf(Screen.CLIP, Screen.PHOTOS, Screen.SIGHTING)
    // The screens that send to the search, and the search lead's question: none opens once the search has ended.
    private val SENDING = ACTIONS + Screen.QUESTION

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

    fun open(s: NavState, target: Screen, ended: Boolean = false): NavState = when {
        // An ended search takes nothing more: the server refuses it.
        ended && target in SENDING -> s
        target in ACTIONS && !(s.joined && s.gone) -> s
        // The search lead's question belongs to a search the family has joined.
        target == Screen.QUESTION && !s.joined -> s
        else -> s.copy(screen = target)
    }

    /** The search has ended: a sending screen open now goes back to the status card, which says so. */
    fun ended(s: NavState): NavState = if (s.screen in SENDING) s.copy(screen = Screen.STATUS) else s

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

    /** The family left a search still open: the profile, still "gone", which offers to join again. */
    fun leftOpen(s: NavState): NavState = NavState(Screen.PROFILE, gone = s.gone, joined = false)

    /** This phone is no longer part of the search: the join screen, with the profile's "gone" state kept. */
    fun dropped(s: NavState): NavState = NavState(Screen.JOIN, gone = s.gone, joined = false)
}
