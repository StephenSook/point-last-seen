package app.pointlastseen.family.ui

import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.TrackingAids

/**
 * The profile form's tracking question. Null means the family has not answered; any tick, "None of these" or a
 * note answers it, and unticking keeps the answer, so a "none" is never turned back into "unknown".
 */
object TrackingForm {
    /** The form labels, the same as shared/constants/tracking-aids.json. */
    val LABELS = mapOf(
        "project_lifesaver" to "Enrolled in Project Lifesaver",
        "medicalert_id" to "Wears a MedicAlert ID",
        "gps_tracker" to "Carries a GPS tracker",
        "phone_location" to "Phone location is shared",
    )
    const val NONE = "None of these"
    const val NOTE_LABEL = "Anything else about the device?"
    const val NO_NUMBERS = "Leave out numbers: no phone or serial numbers go on the search card."

    fun toggle(t: TrackingAids?, aid: String): TrackingAids {
        val aids = t?.aids ?: emptyList()
        return TrackingAids(if (aid in aids) aids - aid else aids + aid, t?.note ?: "")
    }

    fun none(t: TrackingAids?): TrackingAids = TrackingAids(emptyList(), t?.note ?: "")

    fun isNone(t: TrackingAids?): Boolean = t != null && t.aids.isEmpty()

    fun note(t: TrackingAids?, text: String): TrackingAids = TrackingAids(t?.aids ?: emptyList(), text)

    /** Why the note cannot be shared as typed, or null; [Profiles.trackingNote] drops a note with any digit. */
    fun noteProblem(text: String): String? =
        if (text.isNotBlank() && Profiles.trackingNote(text).isEmpty()) NO_NUMBERS else null
}
