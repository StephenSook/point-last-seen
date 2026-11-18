package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable

data class PhotosUi(val uploaded: Int, val busy: Boolean, val error: String?)

/** Add recent photos: each is made a 1536 px JPEG with its EXIF removed on the phone, then uploaded. */
@Composable
fun PhotosScreen(mode: String?, killCloud: Boolean, ui: PhotosUi, onPick: () -> Unit, onBack: () -> Unit) {
    FamilyScaffold(mode, killCloud) {
        Sentence("Add recent photos.")
        Note("Photos are made smaller and their location data is removed before they leave this phone.")
        if (ui.uploaded > 0) Note(if (ui.uploaded == 1) "1 photo sent to command." else "${ui.uploaded} photos sent to command.")
        ui.error?.let { Note(it) }
        MainAction("Choose photos", enabled = !ui.busy, onClick = onPick)
        OtherAction("Back", enabled = !ui.busy, onClick = onBack)
    }
}
