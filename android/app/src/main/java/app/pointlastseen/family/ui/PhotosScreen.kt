package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable

/**
 * [cloudRead] is the family's tick for command reading these photos in the cloud (off until ticked);
 * [notSaved] counts photos whose consent record the server did not take.
 */
data class PhotosUi(val uploaded: Int, val busy: Boolean, val error: String?, val cloudRead: Boolean = false, val notSaved: Int = 0)

/** Add recent photos: each is made a 1536 px JPEG with its EXIF removed on the phone, then uploaded. */
@Composable
fun PhotosScreen(
    mode: String?,
    killCloud: Boolean,
    ui: PhotosUi,
    onPick: () -> Unit,
    onBack: () -> Unit,
    onCloudRead: (Boolean) -> Unit = {},
) {
    FamilyScaffold(mode, killCloud) {
        Sentence("Add recent photos.")
        Note("Photos are made smaller and their location data is removed before they leave this phone.")
        Tick("Command may read these photos in the cloud", ui.cloudRead, onCloudRead)
        if (ui.uploaded > 0) Note(if (ui.uploaded == 1) "1 photo sent to command." else "${ui.uploaded} photos sent to command.")
        if (ui.notSaved > 0) {
            Note("The cloud read was not saved for ${if (ui.notSaved == 1) "1 photo" else "${ui.notSaved} photos"}. Command can still see ${if (ui.notSaved == 1) "it" else "them"}.")
        }
        ui.error?.let { Note(it) }
        MainAction("Choose photos", enabled = !ui.busy, onClick = onPick)
        OtherAction("Back", enabled = !ui.busy, onClick = onBack)
    }
}
